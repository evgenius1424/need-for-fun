use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use tokio::sync::{mpsc, Mutex};
use tokio::time::interval;

use crate::binary::{
    encode_room_state, snapshot_for_player, ItemSnapshot, ProjectileSnapshot, SnapshotEncoder,
};
use crate::game::{
    apply_explosions, apply_hit_actions, apply_projectile_hits, process_item_pickups,
    respawn_if_ready, try_fire, update_projectiles, EventVec, HitAction, Projectile,
};
use crate::map::{GameMap, MapItem};
use crate::physics::{step_player, PlayerState};
use crate::protocol::EffectEvent;

const BRICK_WIDTH: f32 = 32.0;
const BRICK_HEIGHT: f32 = 16.0;
const PLAYER_HALF_HEIGHT: f32 = 24.0;

#[derive(Clone, Default)]
pub struct PlayerInput {
    pub key_up: bool,
    pub key_down: bool,
    pub key_left: bool,
    pub key_right: bool,
    pub mouse_down: bool,
    pub weapon_switch: i32,
    pub weapon_scroll: i32,
    pub aim_angle: f32,
    pub facing_left: bool,
}

pub struct PlayerConn {
    pub id: u64,
    pub username: String,
    pub tx: mpsc::UnboundedSender<Bytes>,
    pub input: PlayerInput,
    pub state: PlayerState,
    pub last_input_seq: u64,
}

pub struct Room {
    pub map: Arc<GameMap>,
    pub players: HashMap<u64, PlayerConn>,
    pub tick: u64,
    pub items: Vec<MapItem>,
    pub projectiles: Vec<Projectile>,
    pub next_projectile_id: u64,
    pub snapshot_encoder: SnapshotEncoder,
}

pub struct RoomHandle {
    pub id: String,
    room: Mutex<Room>,
}

impl RoomHandle {
    pub fn new(id: String, map: GameMap) -> Arc<Self> {
        let map = Arc::new(map);
        let handle = Arc::new(Self {
            id: id.clone(),
            room: Mutex::new(Room {
                items: map.items.clone(),
                map,
                players: HashMap::new(),
                tick: 0,
                projectiles: Vec::new(),
                next_projectile_id: 0,
                snapshot_encoder: SnapshotEncoder::new(),
            }),
        });
        let cloned = handle.clone();
        tokio::spawn(async move {
            run_room_loop(cloned).await;
        });
        handle
    }

    pub async fn add_player(
        &self,
        player_id: u64,
        username: String,
        tx: mpsc::UnboundedSender<Bytes>,
    ) -> Vec<u8> {
        let mut room = self.room.lock().await;
        let mut state = PlayerState::new(player_id);
        if let Some((row, col)) = room.map.random_respawn() {
            let x = col as f32 * BRICK_WIDTH + 10.0;
            let y = row as f32 * BRICK_HEIGHT - PLAYER_HALF_HEIGHT;
            state.set_xy(x, y, room.map.as_ref());
            state.prev_x = state.x;
            state.prev_y = state.y;
        }
        let player = PlayerConn {
            id: player_id,
            username: username.clone(),
            tx,
            input: PlayerInput::default(),
            state,
            last_input_seq: 0,
        };
        room.players.insert(player_id, player);
        encode_room_state(&self.id, &room)
    }

    pub async fn remove_player(&self, player_id: u64) {
        let mut room = self.room.lock().await;
        room.players.remove(&player_id);
    }

    pub async fn set_input(&self, player_id: u64, input: PlayerInput, seq: u64) {
        let mut room = self.room.lock().await;
        if let Some(player) = room.players.get_mut(&player_id) {
            player.input = input;
            player.last_input_seq = seq;
        }
    }

    pub async fn broadcast(&self, msg: Vec<u8>) {
        let room = self.room.lock().await;
        let payload = Bytes::from(msg);
        for player in room.players.values() {
            let _ = player.tx.send(payload.clone());
        }
    }
}

async fn run_room_loop(handle: Arc<RoomHandle>) {
    let mut tick_interval = interval(Duration::from_millis(16));
    loop {
        tick_interval.tick().await;
        let (payload, player_txs) = {
            let mut room = handle.room.lock().await;
            room.tick += 1;
            let map = Arc::clone(&room.map);
            let mut hit_actions = Vec::<HitAction>::new();
            let mut events: EventVec = EventVec::new();

            let mut projectiles = std::mem::take(&mut room.projectiles);
            let mut next_projectile_id = room.next_projectile_id;

            let player_ids: Vec<u64> = room.players.keys().copied().collect();
            let mut players_snapshot: Vec<PlayerState> = Vec::with_capacity(player_ids.len());
            for id in &player_ids {
                if let Some(player) = room.players.get_mut(id) {
                    apply_input_to_state(&player.input, &mut player.state);
                    if !player.state.dead && player.input.mouse_down {
                        try_fire(
                            &mut player.state,
                            &mut projectiles,
                            map.as_ref(),
                            &mut next_projectile_id,
                            &mut hit_actions,
                            &mut events,
                        );
                    }
                    step_player(&mut player.state, map.as_ref());
                    respawn_if_ready(&mut player.state, map.as_ref());
                    players_snapshot.push(player.state.clone());
                }
            }

            apply_hit_actions(&hit_actions, &mut players_snapshot, &mut events);

            let mut explosions = update_projectiles(map.as_ref(), &mut projectiles);
            let mut proj_explosions =
                apply_projectile_hits(&mut projectiles, &mut players_snapshot, &mut events);
            explosions.append(&mut proj_explosions);
            apply_explosions(&explosions, &mut players_snapshot, &mut events);

            for explosion in &explosions {
                events.push(EffectEvent::Explosion {
                    x: explosion.x,
                    y: explosion.y,
                    kind: explosion.kind.as_str(),
                });
            }

            process_item_pickups(&mut players_snapshot, &mut room.items);

            let mut state_map: HashMap<u64, PlayerState> =
                players_snapshot.into_iter().map(|p| (p.id, p)).collect();
            for player in room.players.values_mut() {
                if let Some(updated) = state_map.remove(&player.id) {
                    player.state = updated;
                }
            }

            room.projectiles = projectiles;
            room.next_projectile_id = next_projectile_id;

            let player_snapshots: Vec<crate::protocol::PlayerSnapshot> =
                room.players.values().map(snapshot_for_player).collect();
            let item_snapshots: Vec<ItemSnapshot> = room
                .items
                .iter()
                .map(|item| ItemSnapshot {
                    active: item.active,
                    respawn_timer: item.respawn_timer as i16,
                })
                .collect();
            let projectile_snapshots: Vec<ProjectileSnapshot> = room
                .projectiles
                .iter()
                .map(|proj| ProjectileSnapshot {
                    id: proj.id,
                    x: proj.x,
                    y: proj.y,
                    velocity_x: proj.velocity_x,
                    velocity_y: proj.velocity_y,
                    owner_id: proj.owner_id as i64,
                    kind: proj.kind.as_u8(),
                })
                .collect();
            let player_txs: Vec<mpsc::UnboundedSender<Bytes>> =
                room.players.values().map(|p| p.tx.clone()).collect();
            let tick = room.tick;
            let payload = room
                .snapshot_encoder
                .encode_snapshot(
                    tick,
                    &player_snapshots,
                    &item_snapshots,
                    &projectile_snapshots,
                    &events,
                )
                .to_vec();
            (payload, player_txs)
        };

        let payload = Bytes::from(payload);
        for tx in player_txs {
            let _ = tx.send(payload.clone());
        }
    }
}

fn apply_input_to_state(input: &PlayerInput, state: &mut PlayerState) {
    state.key_up = input.key_up;
    state.key_down = input.key_down;
    state.key_left = input.key_left;
    state.key_right = input.key_right;
    state.aim_angle = input.aim_angle;
    state.facing_left = input.facing_left;

    if input.weapon_switch >= 0 && input.weapon_switch <= 8 {
        let idx = input.weapon_switch as usize;
        if state.weapons[idx] {
            state.current_weapon = input.weapon_switch;
        }
    } else if input.weapon_scroll != 0 {
        let dir = if input.weapon_scroll < 0 { -1 } else { 1 };
        let total = 9;
        for step in 1..=total {
            let mut next = state.current_weapon + dir * step;
            if next < 0 {
                next += total;
            }
            if next >= total {
                next -= total;
            }
            if state.weapons[next as usize] {
                state.current_weapon = next;
                break;
            }
        }
    }
}
