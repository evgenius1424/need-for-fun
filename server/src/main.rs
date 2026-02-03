use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use bytes::Bytes;
use tokio::sync::{mpsc, Mutex};
use tracing::{error, info};

mod map;
mod physics;
mod protocol;
mod room;
mod game;
mod constants;
mod binary;

use crate::map::GameMap;
use crate::binary::{
    decode_client_message, encode_player_joined, encode_player_left, encode_welcome,
};
use crate::protocol::ClientMsg;
use crate::room::{PlayerInput, RoomHandle};

struct AppState {
    rooms: Mutex<HashMap<String, Arc<RoomHandle>>>,
    next_player_id: AtomicU64,
    map_dir: PathBuf,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let map_dir = std::env::var("MAP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../public/maps"));

    let state = Arc::new(AppState {
        rooms: Mutex::new(HashMap::new()),
        next_player_id: AtomicU64::new(1),
        map_dir,
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{port}");
    info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: Arc<AppState>, socket: WebSocket) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Bytes>();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Binary(msg.to_vec())).await.is_err() {
                break;
            }
        }
    });

    let player_id = state.next_player_id.fetch_add(1, Ordering::Relaxed);
    let mut username = format!("player{player_id}");
    let mut room_handle: Option<Arc<RoomHandle>> = None;

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(_) => {
                error!("received unexpected text frame");
            }
            Message::Binary(bytes) => match decode_client_message(&bytes) {
                Ok(msg) => {
                    handle_client_msg(
                        &state,
                        &mut room_handle,
                        &mut username,
                        player_id,
                        msg,
                        tx.clone(),
                    )
                    .await;
                }
                Err(err) => {
                    error!("bad message: {err:?}");
                }
            },
            Message::Close(_) => break,
            _ => {}
        }
    }

    if let Some(handle) = room_handle {
        handle.remove_player(player_id).await;
        let payload = encode_player_left(player_id);
        handle.broadcast(payload).await;
    }

    send_task.abort();
}

async fn handle_client_msg(
    state: &Arc<AppState>,
    room_handle: &mut Option<Arc<RoomHandle>>,
    username: &mut String,
    player_id: u64,
    msg: ClientMsg,
    tx: mpsc::UnboundedSender<Bytes>,
) {
    match msg {
        ClientMsg::Hello { username: name } => {
            *username = name;
            let _ = tx.send(encode_welcome(player_id).into());
        }
        ClientMsg::JoinRoom { room_id, map } => {
            let room_id = room_id.unwrap_or_else(|| "room-1".to_string());
            let map_name = map.unwrap_or_else(|| "dm2".to_string());
            let handle = get_or_create_room(state, &room_id, &map_name).await;
            let room_state = handle.add_player(player_id, username.clone(), tx.clone()).await;
            let _ = tx.send(room_state.into());
            let joined = encode_player_joined(player_id, username);
            handle.broadcast(joined).await;
            *room_handle = Some(handle);
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
            if let Some(handle) = room_handle.as_ref() {
                let input = PlayerInput {
                    key_up,
                    key_down,
                    key_left,
                    key_right,
                    mouse_down,
                    weapon_switch,
                    weapon_scroll,
                    aim_angle,
                    facing_left,
                };
                handle.set_input(player_id, input, seq).await;
            }
        }
    }
}

async fn get_or_create_room(
    state: &Arc<AppState>,
    room_id: &str,
    map_name: &str,
) -> Arc<RoomHandle> {
    let mut rooms = state.rooms.lock().await;
    if let Some(room) = rooms.get(room_id) {
        return room.clone();
    }

    let map = GameMap::load(&state.map_dir, map_name)
        .unwrap_or_else(|_| GameMap::load(&state.map_dir, "dm2").unwrap());
    let handle = RoomHandle::new(room_id.to_string(), map);
    rooms.insert(room_id.to_string(), handle.clone());
    handle
}
