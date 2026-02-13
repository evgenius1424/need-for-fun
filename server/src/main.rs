#![forbid(unsafe_code)]
#![deny(rust_2018_idioms)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::panic)]

use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{error, info, warn};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::ice_transport::ice_credential_type::RTCIceCredentialType;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

mod binary;
mod constants;
mod game;
mod map;
mod physics;
mod room;

use crate::binary::{decode_client_message, encode_pong, encode_welcome, ClientMsg};
use crate::constants::{
    DEFAULT_MAP_DIR, DEFAULT_MAP_NAME, DEFAULT_PORT, DEFAULT_ROOM_ID, OUTBOUND_CHANNEL_CAPACITY,
    ROOM_COMMAND_CAPACITY,
};
use crate::game::WeaponId;
use crate::map::GameMap;
use crate::room::{PlayerId, PlayerInput, RoomHandle, RoomId};

struct AppState {
    rooms: RwLock<HashMap<RoomId, Arc<RoomHandle>>>,
    next_player_id: AtomicU64,
    map_dir: PathBuf,
    started_at: Instant,
}

enum ControlOut {
    Pong(Bytes),
    Close,
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
        rooms: RwLock::new(HashMap::new()),
        next_player_id: AtomicU64::new(1),
        map_dir,
        started_at: Instant::now(),
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/rtc", get(rtc_ws_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| DEFAULT_PORT.to_string());
    let addr = format!("0.0.0.0:{port}");
    info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).tcp_nodelay(true).await
}

async fn ws_handler(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn rtc_ws_handler(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_rtc_socket(state, socket))
}

async fn handle_socket(state: Arc<AppState>, socket: WebSocket) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let (outbound_tx, mut outbound_rx) = mpsc::channel::<Bytes>(OUTBOUND_CHANNEL_CAPACITY);
    let (control_tx, mut control_rx) = mpsc::channel::<ControlOut>(8);

    let send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(control) = control_rx.recv() => {
                    let result = match control {
                        ControlOut::Pong(payload) => {
                            ws_sender.send(Message::Pong(payload.to_vec())).await
                        }
                        ControlOut::Close => ws_sender.send(Message::Close(Some(CloseFrame {
                            code: axum::extract::ws::close_code::PROTOCOL,
                            reason: "protocol error".into(),
                        }))).await,
                    };
                    if result.is_err() {
                        break;
                    }
                }
                Some(msg) = outbound_rx.recv() => {
                    // axum 0.7 websocket `Message::Binary` takes `Vec<u8>`, so this copy is required.
                    if ws_sender.send(Message::Binary(msg.to_vec())).await.is_err() {
                        break;
                    }
                }
                else => break,
            }
        }
    });

    let player_id = PlayerId(state.next_player_id.fetch_add(1, Ordering::Relaxed));
    let mut username = format!("player{}", player_id.0);
    let mut current_room: Option<Arc<RoomHandle>> = None;

    if outbound_tx
        .try_send(Bytes::from(encode_welcome(player_id.0)))
        .is_err()
    {
        let _ = send_task.await;
        return;
    }

    while let Some(result) = ws_receiver.next().await {
        let Ok(msg) = result else {
            break;
        };

        let keep_running = match msg {
            Message::Text(_) => {
                warn!(
                    player_id = player_id.0,
                    "closing socket after unexpected text frame"
                );
                let _ = control_tx.try_send(ControlOut::Close);
                false
            }
            Message::Binary(bytes) => match decode_client_message(&bytes) {
                Ok(client_msg) => {
                    handle_client_msg(
                        &state,
                        &mut current_room,
                        &mut username,
                        player_id,
                        client_msg,
                        &outbound_tx,
                    )
                    .await
                }
                Err(err) => {
                    warn!(player_id = player_id.0, "bad message: {err:?}");
                    true
                }
            },
            Message::Ping(payload) => {
                let _ = control_tx.try_send(ControlOut::Pong(Bytes::from(payload)));
                true
            }
            Message::Close(_) => false,
            Message::Pong(_) => true,
        };

        if !keep_running {
            break;
        }
    }

    if let Some(room) = current_room.take() {
        room.leave(player_id);
    }

    drop(outbound_tx);
    drop(control_tx);

    if let Err(err) = send_task.await {
        error!(player_id = player_id.0, "send task join error: {err}");
    }
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

    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

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
    current_room: &mut Option<Arc<RoomHandle>>,
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
            let room_id = RoomId::from(room_id.unwrap_or_else(|| DEFAULT_ROOM_ID.to_string()));
            let map_name = map.unwrap_or_else(|| DEFAULT_MAP_NAME.to_string());

            if current_room
                .as_ref()
                .is_some_and(|room| room.id() == &room_id)
            {
                return true;
            }

            if let Some(previous_room) = current_room.take() {
                previous_room.leave(player_id);
            }

            let Some(handle) = get_or_create_room(state, room_id.clone(), &map_name).await else {
                warn!(
                    player_id = player_id.0,
                    room_id = room_id.as_str(),
                    "join rejected: room map unavailable"
                );
                return true;
            };

            let Some(room_state) = handle
                .join(player_id, username.clone(), outbound_tx.clone())
                .await
            else {
                warn!(
                    player_id = player_id.0,
                    "room join failed: room task closed"
                );
                return true;
            };

            if outbound_tx.try_send(room_state).is_err() {
                return false;
            }

            *current_room = Some(handle);
            true
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

async fn get_or_create_room(
    state: &Arc<AppState>,
    room_id: RoomId,
    map_name: &str,
) -> Option<Arc<RoomHandle>> {
    if let Some(existing) = state.rooms.read().await.get(&room_id).cloned() {
        return Some(existing);
    }

    let map = match load_map(&state.map_dir, map_name) {
        Some(map) => map,
        None => return None,
    };

    let mut rooms = state.rooms.write().await;
    if let Some(existing) = rooms.get(&room_id).cloned() {
        return Some(existing);
    }

    let handle = RoomHandle::new(room_id.clone(), map, state.started_at);
    rooms.insert(room_id, handle.clone());
    Some(handle)
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU64;
    use std::sync::Arc;
    use std::time::Instant;

    use bytes::Bytes;
    use tokio::sync::{mpsc, RwLock};

    use super::{handle_client_msg, AppState};
    use crate::binary::ClientMsg;
    use crate::map::GameMap;
    use crate::room::{PlayerId, RoomHandle, RoomId};

    fn simple_map() -> GameMap {
        GameMap {
            rows: 1,
            cols: 1,
            bricks: vec![0],
            respawns: vec![(0, 0)],
            items: Vec::new(),
            name: "test".to_string(),
        }
    }

    #[tokio::test]
    async fn player_can_move_between_rooms_without_ghosting() {
        let room_a = RoomHandle::new(RoomId("a".to_string()), simple_map(), Instant::now());
        let room_b = RoomHandle::new(RoomId("b".to_string()), simple_map(), Instant::now());

        let mut rooms = std::collections::HashMap::new();
        rooms.insert(RoomId("a".to_string()), Arc::clone(&room_a));
        rooms.insert(RoomId("b".to_string()), Arc::clone(&room_b));

        let state = Arc::new(AppState {
            rooms: RwLock::new(std::collections::HashMap::new()),
            next_player_id: AtomicU64::new(1),
            map_dir: std::path::PathBuf::new(),
            started_at: Instant::now(),
        });
        *state.rooms.write().await = rooms;

        let (tx, _rx) = mpsc::channel::<Bytes>(8);
        let mut current_room: Option<Arc<RoomHandle>> = None;
        let mut username = "player7".to_string();

        let joined_first = handle_client_msg(
            &state,
            &mut current_room,
            &mut username,
            PlayerId(7),
            ClientMsg::JoinRoom {
                room_id: Some("a".to_string()),
                map: None,
            },
            &tx,
        )
        .await;
        assert!(joined_first);
        assert!(room_a.contains_player(PlayerId(7)).await);

        let joined_second = handle_client_msg(
            &state,
            &mut current_room,
            &mut username,
            PlayerId(7),
            ClientMsg::JoinRoom {
                room_id: Some("b".to_string()),
                map: None,
            },
            &tx,
        )
        .await;
        assert!(joined_second);

        tokio::task::yield_now().await;
        assert!(!room_a.contains_player(PlayerId(7)).await);
        assert!(room_b.contains_player(PlayerId(7)).await);
    }
}
