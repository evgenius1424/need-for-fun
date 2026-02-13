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
mod game;
mod map;
mod room;
mod constants {
    pub use physics_core::constants::WEAPON_COUNT;
    pub use physics_core::constants::{PLAYER_HALF_H, TILE_H, TILE_W};

    // Re-export projectile/weapon constants from physics_core
    pub use physics_core::constants::{
        ARMOR_ABSORPTION, DAMAGE, DEFAULT_AMMO, FIRE_RATE, GAUNTLET_PLAYER_RADIUS, GAUNTLET_RANGE,
        GRENADE_HIT_GRACE, HITSCAN_PLAYER_RADIUS, MACHINE_RANGE, MAX_ARMOR, MAX_HEALTH,
        MEGA_HEALTH, PICKUP_AMMO, PICKUP_RADIUS, PLASMA_SPLASH_DMG, PLASMA_SPLASH_PUSH,
        PLASMA_SPLASH_RADIUS, QUAD_DURATION, QUAD_MULTIPLIER, RESPAWN_TIME, SELF_DAMAGE_REDUCTION,
        SELF_HIT_GRACE, SHOTGUN_PELLETS, SHOTGUN_RANGE, SHOTGUN_SPREAD, SPAWN_OFFSET_X,
        SPAWN_PROTECTION, SPLASH_RADIUS, WEAPON_ORIGIN_CROUCH_LIFT, WEAPON_PUSH,
    };

    pub const DEFAULT_PORT: &str = "3001";
    pub const DEFAULT_ROOM_ID: &str = "room-1";
    pub const DEFAULT_MAP_NAME: &str = "dm2";
    pub const DEFAULT_MAP_DIR: &str = "../public/maps";

    pub const TICK_MILLIS: u64 = 16;
    pub const SNAPSHOT_INTERVAL_TICKS: u64 = 2;
    pub const OUTBOUND_CHANNEL_CAPACITY: usize = 64;
    pub const ROOM_COMMAND_CAPACITY: usize = 1024;

    pub const SNAPSHOT_BUFFER_RING: usize = 8;
}

mod physics {
    use physics_core::step::step_player as core_step_player;

    use crate::map::GameMap;

    pub use physics_core::types::PlayerState;

    pub fn step_player(player: &mut PlayerState, map: &GameMap) {
        let input = physics_core::types::PlayerInput {
            key_up: player.key_up,
            key_down: player.key_down,
            key_left: player.key_left,
            key_right: player.key_right,
        };

        core_step_player(player, input, map);
    }
}

mod protocol {
    // Re-export types from binary_protocol for server use
    pub use binary_protocol::{ClientMsg, EffectEvent, PlayerSnapshot};
}

use crate::binary::{decode_client_message, encode_pong, encode_welcome};
use crate::constants::{
    DEFAULT_MAP_DIR, DEFAULT_MAP_NAME, DEFAULT_PORT, DEFAULT_ROOM_ID, OUTBOUND_CHANNEL_CAPACITY,
};
use crate::game::WeaponId;
use crate::map::GameMap;
use crate::protocol::ClientMsg;
use crate::room::{PlayerId, PlayerInput, RoomHandle, RoomId};

struct AppState {
    rooms: RwLock<HashMap<RoomId, Arc<RoomHandle>>>,
    next_player_id: AtomicU64,
    map_dir: PathBuf,
    started_at: Instant,
}

enum ControlOut {
    Pong(Vec<u8>),
    Close,
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

#[derive(Default)]
struct RtcSessionCtx {
    current_room: Option<Arc<RoomHandle>>,
    username: String,
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
                        ControlOut::Pong(payload) => ws_sender.send(Message::Pong(payload)).await,
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
                let _ = control_tx.try_send(ControlOut::Pong(payload));
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

    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_string()],
                ..Default::default()
            },
            RTCIceServer {
                urls: vec!["turn:turn.example.com:3478".to_string()],
                username: "user".to_string(),
                credential: "pass".to_string(),
                credential_type: RTCIceCredentialType::Password,
            }, // TODO: replace with real TURN credentials
        ],
        ..Default::default()
    };

    let peer_connection = match api.new_peer_connection(config).await {
        Ok(pc) => Arc::new(pc),
        Err(_) => return,
    };

    let (game_outbound_tx, game_outbound_rx) = mpsc::channel::<Bytes>(OUTBOUND_CHANNEL_CAPACITY);
    let game_outbound_rx = Arc::new(Mutex::new(Some(game_outbound_rx)));

    let player_id = PlayerId(state.next_player_id.fetch_add(1, Ordering::Relaxed));
    let session_ctx = Arc::new(Mutex::new(RtcSessionCtx {
        current_room: None,
        username: format!("player{}", player_id.0),
    }));

    let state_for_dc = Arc::clone(&state);
    let game_outbound_tx_for_dc = game_outbound_tx.clone();
    let game_outbound_rx_for_dc = Arc::clone(&game_outbound_rx);
    let session_ctx_for_dc = Arc::clone(&session_ctx);
    peer_connection.on_data_channel(Box::new(move |dc| {
        let label = dc.label().to_string();
        if label != "control" && label != "game" {
            return Box::pin(async {});
        }
        let state_for_msg = Arc::clone(&state_for_dc);
        let game_outbound_tx_for_msg = game_outbound_tx_for_dc.clone();
        let game_outbound_rx_for_msg = Arc::clone(&game_outbound_rx_for_dc);
        let session_ctx_for_msg = Arc::clone(&session_ctx_for_dc);

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
                let state_for_msg2 = Arc::clone(&state_for_msg);
                let game_outbound_tx_for_msg2 = game_outbound_tx_for_msg.clone();
                let session_ctx_for_msg2 = Arc::clone(&session_ctx_for_msg);
                Box::pin(async move {
                    if msg.is_string {
                        return;
                    }
                    let Ok(client_msg) = decode_client_message(&msg.data) else {
                        return;
                    };

                    let mut guard = session_ctx_for_msg2.lock().await;
                    let mut current_room = guard.current_room.take();
                    let mut username = std::mem::take(&mut guard.username);
                    drop(guard);

                    let _ = handle_client_msg(
                        &state_for_msg2,
                        &mut current_room,
                        &mut username,
                        player_id,
                        client_msg,
                        &game_outbound_tx_for_msg2,
                    )
                    .await;

                    let mut guard = session_ctx_for_msg2.lock().await;
                    guard.current_room = current_room;
                    guard.username = username;
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

    if let Some(room) = session_ctx.lock().await.current_room.take() {
        room.leave(player_id);
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
                weapon_switch: WeaponId::from_i32(weapon_switch),
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU64;
    use std::sync::Arc;
    use std::time::Instant;

    use bytes::Bytes;
    use tokio::sync::{mpsc, RwLock};

    use super::{handle_client_msg, AppState};
    use crate::map::GameMap;
    use crate::protocol::ClientMsg;
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
