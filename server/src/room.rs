use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use tokio::sync::{mpsc, oneshot};
use tokio::time::interval;
use tracing::{debug, warn};

use crate::binary::{
    encode_player_joined, encode_player_left, encode_room_state, player_snapshot_from_state,
    ItemSnapshot, ProjectileSnapshot, RoomStatePlayer, SnapshotEncoder,
};
use crate::binary::{EffectEvent, PlayerSnapshot};
use crate::constants::{
    PLAYER_HALF_H, ROOM_COMMAND_CAPACITY, SNAPSHOT_INTERVAL_TICKS, SPAWN_OFFSET_X, TICK_MILLIS,
    TILE_H, TILE_W,
};
use crate::game::{
    apply_explosions, apply_hit_actions, apply_projectile_hits, process_item_pickups,
    respawn_if_ready_with_rng, try_fire, update_projectiles, EventVec, Explosion, HitAction, IdGen,
    PlayerStateAccess, Projectile, WeaponId,
};
use crate::map::{GameMap, MapItem};
use crate::physics::{step_player, PlayerState};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct PlayerId(pub u64);

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub struct RoomId(pub Arc<str>);

impl RoomId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for RoomId {
    fn from(value: String) -> Self {
        Self(Arc::from(value))
    }
}

impl From<&str> for RoomId {
    fn from(value: &str) -> Self {
        Self(Arc::from(value))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Tick(pub u64);

#[derive(Clone, Copy, Default)]
pub struct PlayerInput {
    pub key_up: bool,
    pub key_down: bool,
    pub key_left: bool,
    pub key_right: bool,
    pub mouse_down: bool,
    pub weapon_switch: Option<WeaponId>,
    pub weapon_scroll: i8,
    pub aim_angle: f32,
    pub facing_left: bool,
}

#[derive(Clone)]
pub struct PlayerConn {
    pub id: PlayerId,
    pub username: String,
    pub tx: mpsc::Sender<Bytes>,
    pub input: PlayerInput,
    pub last_input_seq: u64,
}

enum RoomCmd {
    Join {
        player_id: PlayerId,
        username: String,
        tx: mpsc::Sender<Bytes>,
        response: oneshot::Sender<Bytes>,
    },
    Leave {
        player_id: PlayerId,
    },
    Input {
        player_id: PlayerId,
        seq: u64,
        input: PlayerInput,
    },
    #[cfg(test)]
    ContainsPlayer {
        player_id: PlayerId,
        response: oneshot::Sender<bool>,
    },
}

pub struct RoomHandle {
    id: RoomId,
    tx: mpsc::Sender<RoomCmd>,
}

impl RoomHandle {
    pub fn new(id: RoomId, map: GameMap, server_started_at: Instant) -> Arc<Self> {
        let (tx, rx) = mpsc::channel(ROOM_COMMAND_CAPACITY);
        let handle = Arc::new(Self { id, tx });

        let task_handle = Arc::clone(&handle);
        tokio::spawn(async move {
            let mut task = RoomTask::new(task_handle.id.clone(), map, rx, server_started_at);
            task.run().await;
        });

        handle
    }

    pub fn id(&self) -> &RoomId {
        &self.id
    }

    pub async fn join(
        &self,
        player_id: PlayerId,
        username: String,
        tx: mpsc::Sender<Bytes>,
    ) -> Option<Bytes> {
        let (response_tx, response_rx) = oneshot::channel();
        let cmd = RoomCmd::Join {
            player_id,
            username,
            tx,
            response: response_tx,
        };
        if self.tx.send(cmd).await.is_err() {
            return None;
        }
        response_rx.await.ok()
    }

    pub fn leave(&self, player_id: PlayerId) {
        let _ = self.tx.try_send(RoomCmd::Leave { player_id });
    }

    pub fn set_input(&self, player_id: PlayerId, seq: u64, input: PlayerInput) {
        let _ = self.tx.try_send(RoomCmd::Input {
            player_id,
            seq,
            input,
        });
    }

    #[cfg(test)]
    pub async fn contains_player(&self, player_id: PlayerId) -> bool {
        let (response_tx, response_rx) = oneshot::channel();
        if self
            .tx
            .send(RoomCmd::ContainsPlayer {
                player_id,
                response: response_tx,
            })
            .await
            .is_err()
        {
            return false;
        }
        response_rx.await.unwrap_or(false)
    }
}

struct RoomTask {
    room_id: RoomId,
    map: Arc<GameMap>,
    server_started_at: Instant,
    rx: mpsc::Receiver<RoomCmd>,
    tick: Tick,
    items: Vec<MapItem>,
    projectiles: Vec<Projectile>,
    next_projectile_id: IdGen,
    player_store: PlayerStore,
    snapshot_encoder: SnapshotEncoder,
    rng: ChaCha8Rng,
    scratch_player_snapshots: Vec<PlayerSnapshot>,
    scratch_item_snapshots: Vec<ItemSnapshot>,
    scratch_projectile_snapshots: Vec<ProjectileSnapshot>,
    scratch_events: EventVec,
    pending_snapshot_events: EventVec,
    scratch_hit_actions: Vec<HitAction>,
    scratch_explosions: Vec<Explosion>,
    scratch_pending_hits: Vec<(u64, u64, f32)>,
}

struct PlayerStore {
    players: Vec<RoomPlayer>,
    player_index: HashMap<PlayerId, usize>,
}

struct RoomPlayer {
    conn: PlayerConn,
    state: PlayerState,
}

impl PlayerStateAccess for RoomPlayer {
    fn state(&self) -> &PlayerState {
        &self.state
    }

    fn state_mut(&mut self) -> &mut PlayerState {
        &mut self.state
    }
}

impl PlayerStore {
    fn new() -> Self {
        Self {
            players: Vec::new(),
            player_index: HashMap::new(),
        }
    }

    fn len(&self) -> usize {
        self.players.len()
    }

    fn is_empty(&self) -> bool {
        self.players.is_empty()
    }

    fn contains(&self, player_id: PlayerId) -> bool {
        self.player_index.contains_key(&player_id)
    }

    fn player_mut_by_id(&mut self, player_id: PlayerId) -> Option<&mut PlayerConn> {
        let idx = self.player_index.get(&player_id).copied()?;
        Some(&mut self.players[idx].conn)
    }

    fn pair_mut(&mut self, idx: usize) -> (&mut PlayerConn, &mut PlayerState) {
        let (_, tail) = self.players.split_at_mut(idx);
        let player = &mut tail[0];
        (&mut player.conn, &mut player.state)
    }

    fn players_mut(&mut self) -> &mut [RoomPlayer] {
        &mut self.players
    }

    fn players(&self) -> &[RoomPlayer] {
        &self.players
    }

    fn insert(&mut self, player: PlayerConn, state: PlayerState) {
        let idx = self.players.len();
        self.player_index.insert(player.id, idx);
        self.players.push(RoomPlayer {
            conn: player,
            state,
        });
    }

    fn remove(&mut self, player_id: PlayerId) -> bool {
        let Some(idx) = self.player_index.remove(&player_id) else {
            return false;
        };

        let last_idx = self.players.len() - 1;
        self.players.swap_remove(idx);

        if idx != last_idx {
            let moved_id = self.players[idx].conn.id;
            self.player_index.insert(moved_id, idx);
        }

        true
    }

    fn validate(&self) {
        debug_assert_eq!(self.players.len(), self.player_index.len());
        for (idx, player) in self.players.iter().enumerate() {
            debug_assert_eq!(self.player_index.get(&player.conn.id), Some(&idx));
        }
    }
}

impl RoomTask {
    fn new(
        room_id: RoomId,
        mut map: GameMap,
        rx: mpsc::Receiver<RoomCmd>,
        server_started_at: Instant,
    ) -> Self {
        let seed = room_id.as_str().bytes().fold(0_u64, |acc, byte| {
            acc.wrapping_mul(31).wrapping_add(byte as u64)
        });

        Self {
            room_id,
            items: std::mem::take(&mut map.items),
            map: Arc::new(map),
            server_started_at,
            rx,
            tick: Tick(0),
            projectiles: Vec::new(),
            next_projectile_id: IdGen::default(),
            player_store: PlayerStore::new(),
            snapshot_encoder: SnapshotEncoder::new(),
            rng: ChaCha8Rng::seed_from_u64(seed),
            scratch_player_snapshots: Vec::new(),
            scratch_item_snapshots: Vec::new(),
            scratch_projectile_snapshots: Vec::new(),
            scratch_events: EventVec::new(),
            pending_snapshot_events: EventVec::new(),
            scratch_hit_actions: Vec::new(),
            scratch_explosions: Vec::new(),
            scratch_pending_hits: Vec::new(),
        }
    }

    async fn run(&mut self) {
        let mut tick_interval = interval(Duration::from_millis(TICK_MILLIS));
        loop {
            tokio::select! {
                maybe_cmd = self.rx.recv() => {
                    let Some(cmd) = maybe_cmd else {
                        break;
                    };
                    self.handle_cmd(cmd);
                    self.drain_commands();
                }
                _ = tick_interval.tick() => {
                    self.drain_commands();
                    self.simulate_tick();
                }
            }
        }
    }

    fn drain_commands(&mut self) {
        while let Ok(cmd) = self.rx.try_recv() {
            self.handle_cmd(cmd);
        }
    }

    fn handle_cmd(&mut self, cmd: RoomCmd) {
        match cmd {
            RoomCmd::Join {
                player_id,
                username,
                tx,
                response,
            } => {
                let join_result = self.handle_join(player_id, username, tx);
                let _ = response.send(join_result.room_state.clone());
                if join_result.broadcast_join {
                    self.broadcast_except(
                        Bytes::from(encode_player_joined(
                            join_result.player_id.0,
                            &join_result.joined_name,
                        )),
                        join_result.player_id,
                    );
                }
            }
            RoomCmd::Leave { player_id } => {
                if self.remove_player(player_id) {
                    self.broadcast(encode_player_left(player_id.0).into());
                }
            }
            RoomCmd::Input {
                player_id,
                seq,
                input,
            } => {
                if let Some(player) = self.player_store.player_mut_by_id(player_id) {
                    if seq >= player.last_input_seq {
                        player.last_input_seq = seq;
                        player.input = input;
                    }
                }
            }
            #[cfg(test)]
            RoomCmd::ContainsPlayer {
                player_id,
                response,
            } => {
                let _ = response.send(self.player_store.contains(player_id));
            }
        }
    }

    fn handle_join(
        &mut self,
        player_id: PlayerId,
        username: String,
        tx: mpsc::Sender<Bytes>,
    ) -> JoinResult {
        let joined_name = username.clone();
        let broadcast_join = if let Some(player) = self.player_store.player_mut_by_id(player_id) {
            player.username = username;
            player.tx = tx;
            false
        } else {
            let mut state = PlayerState::new(player_id.0);
            if let Some((row, col)) = self.map.random_respawn_with_rng(&mut self.rng) {
                let x = col as f32 * TILE_W + SPAWN_OFFSET_X;
                let y = row as f32 * TILE_H - PLAYER_HALF_H;
                state.set_xy(x, y, self.map.as_ref());
                state.prev_x = state.x;
                state.prev_y = state.y;
            }

            self.player_store.insert(
                PlayerConn {
                    id: player_id,
                    username: username.clone(),
                    tx,
                    input: PlayerInput::default(),
                    last_input_seq: 0,
                },
                state,
            );
            self.player_store.validate();
            true
        };

        let players: Vec<RoomStatePlayer<'_>> = self
            .player_store
            .players()
            .iter()
            .map(|player| RoomStatePlayer {
                username: &player.conn.username,
                last_input_seq: player.conn.last_input_seq,
                state: &player.state,
            })
            .collect();

        let room_state = Bytes::from(encode_room_state(
            self.room_id.as_str(),
            self.map.name.as_str(),
            &players,
        ));

        JoinResult {
            player_id,
            joined_name,
            room_state,
            broadcast_join,
        }
    }

    fn remove_player(&mut self, player_id: PlayerId) -> bool {
        let removed = self.player_store.remove(player_id);
        if removed {
            self.player_store.validate();
        }
        removed
    }

    fn simulate_tick(&mut self) {
        self.player_store.validate();
        if self.player_store.is_empty() {
            return;
        }

        self.tick.0 = self.tick.0.wrapping_add(1);
        let map = self.map.as_ref();
        self.scratch_events.clear();
        self.scratch_hit_actions.clear();
        self.scratch_explosions.clear();
        self.scratch_pending_hits.clear();

        for idx in 0..self.player_store.len() {
            let (player, state) = self.player_store.pair_mut(idx);
            let input = player.input;
            apply_input_to_state(&input, state);

            if !state.dead && input.mouse_down {
                try_fire(
                    state,
                    &mut self.projectiles,
                    map,
                    &mut self.next_projectile_id,
                    &mut self.scratch_hit_actions,
                    &mut self.scratch_events,
                    &mut self.rng,
                );
            }

            step_player(state, map);
            respawn_if_ready_with_rng(state, map, &mut self.rng);
        }

        apply_hit_actions(
            &self.scratch_hit_actions,
            self.player_store.players_mut(),
            &mut self.scratch_events,
        );

        update_projectiles(map, &mut self.projectiles, &mut self.scratch_explosions);
        apply_projectile_hits(
            &mut self.projectiles,
            self.player_store.players_mut(),
            &mut self.scratch_events,
            &mut self.scratch_explosions,
        );
        apply_explosions(
            &self.scratch_explosions,
            self.player_store.players_mut(),
            &mut self.scratch_events,
            &mut self.scratch_pending_hits,
        );

        for explosion in &self.scratch_explosions {
            self.scratch_events.push(EffectEvent::Explosion {
                x: explosion.x,
                y: explosion.y,
                kind: explosion.kind.as_u8(),
            });
        }

        process_item_pickups(self.player_store.players_mut(), &mut self.items);

        self.pending_snapshot_events
            .extend(self.scratch_events.drain(..));

        if self.tick.0 % SNAPSHOT_INTERVAL_TICKS != 0 {
            return;
        }

        let server_time_ms = self.server_started_at.elapsed().as_millis() as u64;
        self.build_snapshot_buffers();
        let payload = self.snapshot_encoder.encode_snapshot(
            self.tick.0,
            server_time_ms,
            &self.scratch_player_snapshots,
            &self.scratch_item_snapshots,
            &self.scratch_projectile_snapshots,
            &self.pending_snapshot_events,
        );
        self.pending_snapshot_events.clear();
        self.broadcast(payload);
    }

    fn build_snapshot_buffers(&mut self) {
        self.scratch_player_snapshots.clear();
        self.scratch_item_snapshots.clear();
        self.scratch_projectile_snapshots.clear();

        self.scratch_player_snapshots
            .reserve(self.player_store.len());
        for player in self.player_store.players() {
            self.scratch_player_snapshots
                .push(player_snapshot_from_state(
                    player.conn.last_input_seq,
                    &player.state,
                ));
        }

        self.scratch_item_snapshots.reserve(self.items.len());
        for item in &self.items {
            self.scratch_item_snapshots.push(ItemSnapshot {
                active: item.active,
                respawn_timer: item.respawn_timer as i16,
            });
        }

        self.scratch_projectile_snapshots
            .reserve(self.projectiles.len());
        for projectile in &self.projectiles {
            self.scratch_projectile_snapshots.push(ProjectileSnapshot {
                id: projectile.id,
                x: projectile.x,
                y: projectile.y,
                velocity_x: projectile.velocity_x,
                velocity_y: projectile.velocity_y,
                owner_id: projectile.owner_id as i64,
                kind: projectile.kind.as_u8(),
            });
        }
    }

    fn broadcast(&mut self, payload: Bytes) {
        let mut disconnected_ids = Vec::new();
        for player in self.player_store.players() {
            match player.conn.tx.try_send(payload.clone()) {
                Ok(()) => {}
                Err(err) => {
                    let disconnected_id = player.conn.id;
                    match err {
                        mpsc::error::TrySendError::Full(_) => {
                            warn!(
                                player_id = disconnected_id.0,
                                room_id = self.room_id.as_str(),
                                "dropping slow client: outbound channel full"
                            );
                        }
                        mpsc::error::TrySendError::Closed(_) => {
                            debug!(
                                player_id = disconnected_id.0,
                                room_id = self.room_id.as_str(),
                                "removing disconnected client: outbound channel closed"
                            );
                        }
                    }
                    disconnected_ids.push(disconnected_id);
                }
            }
        }

        for disconnected_id in disconnected_ids {
            if self.remove_player(disconnected_id) {
                let left_payload = Bytes::from(encode_player_left(disconnected_id.0));
                self.broadcast_after_disconnect(left_payload);
            }
        }
    }

    fn broadcast_after_disconnect(&mut self, payload: Bytes) {
        for player in self.player_store.players() {
            let _ = player.conn.tx.try_send(payload.clone());
        }
    }

    fn broadcast_except(&mut self, payload: Bytes, skip_player_id: PlayerId) {
        for player in self.player_store.players() {
            if player.conn.id == skip_player_id {
                continue;
            }
            let _ = player.conn.tx.try_send(payload.clone());
        }
    }
}

struct JoinResult {
    player_id: PlayerId,
    joined_name: String,
    room_state: Bytes,
    broadcast_join: bool,
}

fn apply_input_to_state(input: &PlayerInput, state: &mut PlayerState) {
    state.key_up = input.key_up;
    state.key_down = input.key_down;
    state.key_left = input.key_left;
    state.key_right = input.key_right;
    state.aim_angle = input.aim_angle;
    state.facing_left = input.facing_left;

    if let Some(weapon) = input.weapon_switch {
        let idx = weapon as usize;
        if state.weapons[idx] {
            state.current_weapon = weapon as i32;
        }
    } else if input.weapon_scroll != 0 {
        let dir = if input.weapon_scroll < 0 { -1 } else { 1 };
        let total = crate::constants::WEAPON_COUNT as i32;

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

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use bytes::Bytes;
    use tokio::sync::mpsc;

    use super::{PlayerId, RoomHandle, RoomId};
    use crate::map::GameMap;

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
    async fn join_is_idempotent_and_leave_removes_player() {
        let room = RoomHandle::new(RoomId::from("room-test"), simple_map(), Instant::now());
        let (tx, _rx) = mpsc::channel::<Bytes>(4);

        let first = room
            .join(PlayerId(10), "alice".to_string(), tx.clone())
            .await;
        assert!(first.is_some());
        assert!(room.contains_player(PlayerId(10)).await);

        let second = room.join(PlayerId(10), "alice".to_string(), tx).await;
        assert!(second.is_some());
        assert!(room.contains_player(PlayerId(10)).await);

        room.leave(PlayerId(10));
        tokio::task::yield_now().await;
        assert!(!room.contains_player(PlayerId(10)).await);
    }
}
