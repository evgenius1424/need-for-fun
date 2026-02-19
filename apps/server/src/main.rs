#![forbid(unsafe_code)]
#![deny(rust_2018_idioms)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::panic)]

use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex};
use tracing::{error, info, warn};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::ice_transport::ice_credential_type::RTCIceCredentialType;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

mod binary;
mod constants;
mod game;
mod map;
mod physics;
mod room;
mod room_manager;

use crate::binary::{decode_client_message, encode_pong, encode_welcome, ClientMsg};
use crate::constants::{
    DEFAULT_MAP_DIR, DEFAULT_MAP_NAME, DEFAULT_PORT, DEFAULT_ROOM_ID, OUTBOUND_CHANNEL_CAPACITY,
    ROOM_COMMAND_CAPACITY,
};
use crate::game::WeaponId;
use crate::map::GameMap;
use crate::room::{PlayerId, PlayerInput, RoomConfig, RoomHandle};
use crate::room_manager::RoomManager;

struct AppState {
    room_manager: Arc<RoomManager>,
    next_player_id: AtomicU64,
    map_dir: PathBuf,
    started_at: Instant,
}

enum RtcCmd {
    Client(ClientMsg),
    Shutdown,
}

#[derive(Debug, Deserialize)]
struct RtcSignalIn {
    #[serde(rename = "type")]
    msg_type: String,
    sdp: Option<String>,
}

#[derive(Debug, Serialize)]
struct RtcSignalOut {
    #[serde(rename = "type")]
    msg_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sdp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    let map_dir = std::env::var("MAP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_MAP_DIR));

    let state = Arc::new(AppState {
        room_manager: Arc::new(RoomManager::new(Instant::now())),
        next_player_id: AtomicU64::new(1),
        map_dir,
        started_at: Instant::now(),
    });

    tokio::spawn(run_console(Arc::clone(&state)));

    let app = Router::new()
        .route("/rtc", get(rtc_ws_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| DEFAULT_PORT.to_string());
    let addr = format!("0.0.0.0:{port}");
    info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).tcp_nodelay(true).await
}

async fn rtc_ws_handler(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_rtc_socket(state, socket))
}

async fn handle_rtc_socket(state: Arc<AppState>, socket: WebSocket) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let Some(Ok(Message::Text(offer_text))) = ws_receiver.next().await else {
        return;
    };

    let signal: RtcSignalIn = match serde_json::from_str(&offer_text) {
        Ok(v) => v,
        Err(err) => {
            let payload = serde_json::to_string(&RtcSignalOut {
                msg_type: "error",
                sdp: None,
                message: Some(format!("invalid rtc signal: {err}")),
            })
            .unwrap_or_else(|_| {
                "{\"type\":\"error\",\"message\":\"invalid rtc signal\"}".to_string()
            });
            let _ = ws_sender.send(Message::Text(payload)).await;
            return;
        }
    };

    if signal.msg_type != "offer" || signal.sdp.is_none() {
        let _ = ws_sender
            .send(Message::Text(
                serde_json::to_string(&RtcSignalOut {
                    msg_type: "error",
                    sdp: None,
                    message: Some("expected offer with sdp".to_string()),
                })
                .unwrap_or_else(|_| {
                    "{\"type\":\"error\",\"message\":\"expected offer\"}".to_string()
                }),
            ))
            .await;
        return;
    }

    let mut media_engine = MediaEngine::default();
    if media_engine.register_default_codecs().is_err() {
        return;
    }
    let mut registry = webrtc::interceptor::registry::Registry::new();
    registry = match register_default_interceptors(registry, &mut media_engine) {
        Ok(v) => v,
        Err(_) => return,
    };

    let api = APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build();

    let mut ice_servers = vec![RTCIceServer {
        urls: vec!["stun:stun.l.google.com:19302".to_string()],
        ..Default::default()
    }];
    if let Some(turn_server) = load_turn_server() {
        ice_servers.push(turn_server);
    }
    let config = RTCConfiguration {
        ice_servers,
        ..Default::default()
    };

    let peer_connection = match api.new_peer_connection(config).await {
        Ok(pc) => Arc::new(pc),
        Err(_) => return,
    };
    let (pc_closed_tx, mut pc_closed_rx) = mpsc::channel::<()>(1);
    peer_connection.on_peer_connection_state_change(Box::new(move |state| {
        let pc_closed_tx2 = pc_closed_tx.clone();
        Box::pin(async move {
            if matches!(
                state,
                RTCPeerConnectionState::Disconnected
                    | RTCPeerConnectionState::Failed
                    | RTCPeerConnectionState::Closed
            ) {
                let _ = pc_closed_tx2.try_send(());
            }
        })
    }));

    let (game_outbound_tx, game_outbound_rx) = mpsc::channel::<Bytes>(OUTBOUND_CHANNEL_CAPACITY);
    let game_outbound_rx = Arc::new(Mutex::new(Some(game_outbound_rx)));
    let (rtc_cmd_tx, mut rtc_cmd_rx) = mpsc::channel::<RtcCmd>(ROOM_COMMAND_CAPACITY);

    let player_id = PlayerId(state.next_player_id.fetch_add(1, Ordering::Relaxed));
    let state_for_session = Arc::clone(&state);
    let game_outbound_tx_for_session = game_outbound_tx.clone();
    let session_task = tokio::spawn(async move {
        let mut current_room: Option<Arc<RoomHandle>> = None;
        let mut username = format!("player{}", player_id.0);

        while let Some(cmd) = rtc_cmd_rx.recv().await {
            match cmd {
                RtcCmd::Client(client_msg) => {
                    let keep_running = handle_client_msg(
                        &state_for_session,
                        &mut current_room,
                        &mut username,
                        player_id,
                        client_msg,
                        &game_outbound_tx_for_session,
                    )
                    .await;
                    if !keep_running {
                        break;
                    }
                }
                RtcCmd::Shutdown => break,
            }
        }

        if let Some(room) = current_room.take() {
            room.leave(player_id);
        }
    });

    let game_outbound_rx_for_dc = Arc::clone(&game_outbound_rx);
    let rtc_cmd_tx_for_dc = rtc_cmd_tx.clone();
    peer_connection.on_data_channel(Box::new(move |dc| {
        let label = dc.label().to_string();
        if label != "control" && label != "game" {
            return Box::pin(async {});
        }
        let game_outbound_rx_for_msg = Arc::clone(&game_outbound_rx_for_dc);
        let rtc_cmd_tx_for_msg = rtc_cmd_tx_for_dc.clone();

        Box::pin(async move {
            if label == "control" {
                let dc_for_open = Arc::clone(&dc);
                dc.on_open(Box::new(move || {
                    let dc_for_open2 = Arc::clone(&dc_for_open);
                    Box::pin(async move {
                        let _ = dc_for_open2
                            .send(&Bytes::from(encode_welcome(player_id.0)))
                            .await;
                    })
                }));
            }

            dc.on_message(Box::new(move |msg: DataChannelMessage| {
                let rtc_cmd_tx_for_msg2 = rtc_cmd_tx_for_msg.clone();
                Box::pin(async move {
                    if msg.is_string {
                        return;
                    }
                    let Ok(client_msg) = decode_client_message(&msg.data) else {
                        return;
                    };
                    let _ = rtc_cmd_tx_for_msg2.try_send(RtcCmd::Client(client_msg));
                })
            }));

            if label == "game" {
                let mut maybe_rx = game_outbound_rx_for_msg.lock().await;
                if let Some(mut rx) = maybe_rx.take() {
                    let dc_for_send = Arc::clone(&dc);
                    tokio::spawn(async move {
                        while let Some(payload) = rx.recv().await {
                            if dc_for_send.send(&payload).await.is_err() {
                                break;
                            }
                        }
                    });
                }
            }
        })
    }));

    let offer = match RTCSessionDescription::offer(signal.sdp.unwrap_or_default()) {
        Ok(v) => v,
        Err(_) => return,
    };
    if peer_connection.set_remote_description(offer).await.is_err() {
        return;
    }
    let answer = match peer_connection.create_answer(None).await {
        Ok(v) => v,
        Err(_) => return,
    };
    if peer_connection.set_local_description(answer).await.is_err() {
        return;
    }

    let mut gather_complete = peer_connection.gathering_complete_promise().await;
    let _ = gather_complete.recv().await;

    let Some(local_desc) = peer_connection.local_description().await else {
        return;
    };

    let payload = serde_json::to_string(&RtcSignalOut {
        msg_type: "answer",
        sdp: Some(local_desc.sdp),
        message: None,
    })
    .unwrap_or_else(|_| "{\"type\":\"error\",\"message\":\"failed to build answer\"}".to_string());

    if ws_sender.send(Message::Text(payload)).await.is_err() {
        return;
    }

    drop(ws_sender);
    drop(ws_receiver);
    let _ = pc_closed_rx.recv().await;

    let _ = rtc_cmd_tx.try_send(RtcCmd::Shutdown);
    if let Err(err) = session_task.await {
        error!(
            player_id = player_id.0,
            "rtc session task join error: {err}"
        );
    }
    let _ = peer_connection.close().await;
}

async fn handle_client_msg(
    state: &Arc<AppState>,
    current_room: &mut Option<Arc<crate::room::RoomHandle>>,
    username: &mut String,
    player_id: PlayerId,
    msg: ClientMsg,
    outbound_tx: &mpsc::Sender<Bytes>,
) -> bool {
    match msg {
        ClientMsg::Hello {
            username: requested_name,
        } => {
            if current_room.is_some() {
                info!(player_id = player_id.0, "ignoring hello after room join");
                return true;
            }
            if !requested_name.is_empty() {
                *username = requested_name;
            }
            true
        }
        ClientMsg::JoinRoom { room_id, map } => {
            let room_ref = room_id.unwrap_or_else(|| DEFAULT_ROOM_ID.to_string());
            let map_name = map.unwrap_or_else(|| DEFAULT_MAP_NAME.to_string());

            let Some(game_map) = load_map(&state.map_dir, &map_name) else {
                warn!(
                    player_id = player_id.0,
                    room_ref, "join rejected: room map unavailable"
                );
                return true;
            };
            let config = RoomConfig {
                name: room_ref.clone(),
                max_players: room_manager::ROOM_MAX_PLAYERS_HARD_CAP,
                map_id: map_name,
                mode: "deathmatch".to_string(),
                tick_rate: 60,
                protocol_version: "1".to_string(),
                region: None,
            };
            let Ok(target_room) = state
                .room_manager
                .get_or_create_room(config, game_map)
                .await
            else {
                warn!(
                    player_id = player_id.0,
                    room_ref, "join rejected: room create failed"
                );
                return true;
            };

            match state
                .room_manager
                .join_room(
                    player_id,
                    username.clone(),
                    Arc::clone(&target_room),
                    outbound_tx.clone(),
                )
                .await
            {
                Ok(success) => {
                    if outbound_tx.try_send(success.room_state).is_err() {
                        return false;
                    }
                    *current_room = Some(success.room);
                    true
                }
                Err(rejection) => {
                    let _ = outbound_tx.try_send(rejection);
                    true
                }
            }
        }
        ClientMsg::Input {
            seq,
            key_up,
            key_down,
            key_left,
            key_right,
            mouse_down,
            weapon_switch,
            weapon_scroll,
            aim_angle,
            facing_left,
        } => {
            let Some(room) = current_room.as_ref() else {
                return true;
            };
            let input = PlayerInput {
                key_up,
                key_down,
                key_left,
                key_right,
                mouse_down,
                weapon_switch: WeaponId::try_from(weapon_switch).ok(),
                weapon_scroll: weapon_scroll as i8,
                aim_angle,
                facing_left,
            };
            room.set_input(player_id, seq, input);
            true
        }
        ClientMsg::Ping { client_time_ms } => {
            let server_time_ms = state.started_at.elapsed().as_millis() as u64;
            let _ = outbound_tx.try_send(Bytes::from(encode_pong(client_time_ms, server_time_ms)));
            true
        }
    }
}

async fn run_console(state: Arc<AppState>) {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if !line.starts_with("rooms") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            info!("rooms commands: list|create|close|info|set|rename|kick|move");
            continue;
        }
        match parts[1] {
            "list" => {
                for room in state.room_manager.list_rooms().await {
                    info!(
                        "{} {} {}/{} {}",
                        room.room_id,
                        room.name,
                        room.current_players,
                        room.max_players,
                        room.status.as_str()
                    );
                }
            }
            "create" if parts.len() >= 3 => {
                let name = parts[2].to_string();
                let max_players = parts
                    .get(3)
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(8);
                let map_id = parts.get(4).copied().unwrap_or(DEFAULT_MAP_NAME);
                let mode = parts.get(5).copied().unwrap_or("deathmatch");
                if let Some(map) = load_map(&state.map_dir, map_id) {
                    let cfg = RoomConfig {
                        name,
                        max_players,
                        map_id: map_id.to_string(),
                        mode: mode.to_string(),
                        tick_rate: 60,
                        protocol_version: "1".to_string(),
                        region: None,
                    };
                    if let Err(err) = state.room_manager.create_room(cfg, map).await {
                        warn!("rooms create failed: {err}");
                    }
                }
            }
            "close" if parts.len() >= 3 => {
                if let Err(err) = state.room_manager.close_room(parts[2], "admin_close").await {
                    warn!("rooms close failed: {err}");
                }
            }
            "info" if parts.len() >= 3 => {
                if let Some(info_dump) = state.room_manager.room_info(parts[2]).await {
                    info!(
                        "room {} {} players={} tick={}",
                        info_dump.summary.room_id,
                        info_dump.summary.name,
                        info_dump.summary.current_players,
                        info_dump.tick
                    );
                }
            }
            "set" if parts.len() >= 5 && parts[3] == "maxPlayers" => {
                if let Ok(n) = parts[4].parse::<usize>() {
                    if let Err(err) = state.room_manager.set_room_max_players(parts[2], n).await {
                        warn!("rooms set failed: {err}");
                    }
                }
            }
            "rename" if parts.len() >= 4 => {
                if let Err(err) = state
                    .room_manager
                    .rename_room(parts[2], parts[3].to_string())
                    .await
                {
                    warn!("rooms rename failed: {err}");
                }
            }
            "kick" if parts.len() >= 4 => match parts[3].parse::<u64>() {
                Ok(player_id) => {
                    if let Err(err) = state
                        .room_manager
                        .kick(parts[2], PlayerId(player_id), "admin_kick".to_string())
                        .await
                    {
                        warn!("rooms kick failed: {err}");
                    }
                }
                Err(_) => warn!("rooms kick failed: invalid player id"),
            },
            "move" if parts.len() >= 4 => match parts[2].parse::<u64>() {
                Ok(player_id) => {
                    let (tx, _rx) = mpsc::channel::<Bytes>(1);
                    if let Err(_) = state
                        .room_manager
                        .move_player(
                            PlayerId(player_id),
                            parts[3],
                            format!("player{}", player_id),
                            tx,
                        )
                        .await
                    {
                        warn!("rooms move failed");
                    }
                }
                Err(_) => warn!("rooms move failed: invalid player id"),
            },
            _ => warn!("unknown rooms command"),
        }
    }
}

fn load_map(map_dir: &Path, map_name: &str) -> Option<GameMap> {
    match GameMap::load(map_dir, map_name) {
        Ok(map) => Some(map),
        Err(primary_err) => {
            error!("failed to load map '{map_name}': {primary_err}");
            None
        }
    }
}

fn load_turn_server() -> Option<RTCIceServer> {
    let turn_url = std::env::var("TURN_URL").ok()?;
    let username = std::env::var("TURN_USERNAME").unwrap_or_default();
    let credential = std::env::var("TURN_PASSWORD").unwrap_or_default();

    let mut server = RTCIceServer {
        urls: vec![turn_url],
        ..Default::default()
    };

    if !username.is_empty() || !credential.is_empty() {
        server.username = username;
        server.credential = credential;
        server.credential_type = RTCIceCredentialType::Password;
    }

    Some(server)
}
