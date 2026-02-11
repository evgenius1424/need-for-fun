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
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};

mod binary;
mod constants;
mod game;
mod map;
mod physics;
mod protocol;
mod room;

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
        room.leave(player_id).await;
    }

    drop(outbound_tx);
    drop(control_tx);

    if let Err(err) = send_task.await {
        error!(player_id = player_id.0, "send task join error: {err}");
    }
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
                previous_room.leave(player_id).await;
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

            room.set_input(player_id, seq, input).await;
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

    let map = match load_map_with_fallback(&state.map_dir, map_name) {
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

fn load_map_with_fallback(map_dir: &Path, map_name: &str) -> Option<GameMap> {
    match GameMap::load(map_dir, map_name) {
        Ok(map) => Some(map),
        Err(primary_err) => {
            warn!(
                "failed to load map '{map_name}': {primary_err}. trying fallback '{DEFAULT_MAP_NAME}'"
            );
            match GameMap::load(map_dir, DEFAULT_MAP_NAME) {
                Ok(map) => Some(map),
                Err(fallback_err) => {
                    error!("failed to load fallback map '{DEFAULT_MAP_NAME}': {fallback_err}");
                    None
                }
            }
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
