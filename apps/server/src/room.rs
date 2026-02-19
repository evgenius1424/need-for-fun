use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use smallvec::SmallVec;
use tokio::sync::{mpsc, oneshot};
use tokio::time::interval;
use tracing::{debug, info, warn};

use crate::binary::{
    encode_kicked, encode_player_joined, encode_player_left, encode_room_closed, encode_room_state,
    player_snapshot_from_state, ItemSnapshot, SnapshotEncoder,
};
use crate::binary::{EffectEvent, PlayerSnapshot};
use crate::constants::{
    PLAYER_HALF_H, ROOM_COMMAND_CAPACITY, SNAPSHOT_INTERVAL_TICKS, SPAWN_OFFSET_X, TICK_MILLIS,
    TILE_H, TILE_W,
};
use crate::game::{
    apply_explosions, apply_hit_actions, apply_projectile_hits, process_item_pickups,
    respawn_if_ready_with_rng, try_fire, update_projectiles, EventVec, Explosion, HitAction, IdGen,
    Projectile, WeaponId,
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
pub enum RoomStatus {
    Created,
    Running,
    Closing,
    Closed,
}

impl RoomStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Running => "running",
            Self::Closing => "closing",
            Self::Closed => "closed",
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Self::Running => 0,
            Self::Created => 1,
            Self::Closing => 2,
            Self::Closed => 3,
        }
    }
}

#[derive(Clone, Debug)]
pub struct RoomConfig {
    pub name: String,
    pub max_players: usize,
    pub map_id: String,
    pub mode: String,
    pub tick_rate: u64,
    pub protocol_version: String,
    pub region: Option<String>,
}

#[derive(Clone, Debug)]
pub struct RoomSummary {
    pub room_id: String,
    pub name: String,
    pub current_players: usize,
    pub max_players: usize,
    pub map_id: String,
    pub mode: String,
    pub status: RoomStatus,
    pub created_at_ms: u64,
    pub last_activity_at_ms: u64,
    pub protocol_version: String,
    pub region: Option<String>,
}

#[derive(Clone, Debug)]
pub struct RoomInfo {
    pub summary: RoomSummary,
    pub players: Vec<(u64, String)>,
    pub tick: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JoinError {
    RoomFull,
    RoomClosing,
}

impl JoinError {
    pub fn reason(self) -> &'static str {
        match self {
            Self::RoomFull => "room_full",
            Self::RoomClosing => "room_closing",
        }
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
        response: oneshot::Sender<Result<Bytes, JoinError>>,
    },
    Leave {
        player_id: PlayerId,
    },
    Kick {
        player_id: PlayerId,
        reason: String,
        response: oneshot::Sender<bool>,
    },
    Input {
        player_id: PlayerId,
        seq: u64,
        input: PlayerInput,
    },
    Summary {
        response: oneshot::Sender<RoomSummary>,
    },
    Info {
        response: oneshot::Sender<RoomInfo>,
    },
    Rename {
        name: String,
    },
    SetMaxPlayers {
        max_players: usize,
        response: oneshot::Sender<Result<(), String>>,
    },
    BeginClose {
        reason: String,
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
    pub fn new(
        id: RoomId,
        map: GameMap,
        config: RoomConfig,
        server_started_at: Instant,
    ) -> Arc<Self> {
        let (tx, rx) = mpsc::channel(ROOM_COMMAND_CAPACITY);
        let handle = Arc::new(Self { id, tx });

        let task_handle = Arc::clone(&handle);
        tokio::spawn(async move {
            let mut task =
                RoomTask::new(task_handle.id.clone(), map, config, rx, server_started_at);
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
    ) -> Result<Bytes, JoinError> {
        let (response_tx, response_rx) = oneshot::channel();
        let cmd = RoomCmd::Join {
            player_id,
            username,
            tx,
            response: response_tx,
        };
        if self.tx.send(cmd).await.is_err() {
            return Err(JoinError::RoomClosing);
        }
        response_rx.await.unwrap_or(Err(JoinError::RoomClosing))
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

    pub async fn summary(&self) -> Option<RoomSummary> {
        let (tx, rx) = oneshot::channel();
        if self
            .tx
            .send(RoomCmd::Summary { response: tx })
            .await
            .is_err()
        {
            return None;
        }
        rx.await.ok()
    }

    pub async fn info(&self) -> Option<RoomInfo> {
        let (tx, rx) = oneshot::channel();
        if self.tx.send(RoomCmd::Info { response: tx }).await.is_err() {
            return None;
        }
        rx.await.ok()
    }

    pub fn rename(&self, name: String) {
        let _ = self.tx.try_send(RoomCmd::Rename { name });
    }

    pub async fn set_max_players(&self, max_players: usize) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        if self
            .tx
            .send(RoomCmd::SetMaxPlayers {
                max_players,
                response: tx,
            })
            .await
            .is_err()
        {
            return Err("room_closed".to_string());
        }
        rx.await.unwrap_or_else(|_| Err("room_closed".to_string()))
    }

    pub async fn begin_close(&self, reason: String) -> Result<(), String> {
        self.tx
            .send(RoomCmd::BeginClose { reason })
            .await
            .map_err(|_| "room_closed".to_string())
    }

    pub async fn kick(&self, player_id: PlayerId, reason: String) -> bool {
        let (tx, rx) = oneshot::channel();
        if self
            .tx
            .send(RoomCmd::Kick {
                player_id,
                reason,
                response: tx,
            })
            .await
            .is_err()
        {
            return false;
        }
        rx.await.unwrap_or(false)
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
    config: RoomConfig,
    status: RoomStatus,
    created_at: Instant,
    last_activity_at: Instant,
    server_started_at: Instant,
    close_reason: Option<String>,
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
    scratch_events: EventVec,
    pending_snapshot_events: EventVec,
    scratch_hit_actions: Vec<HitAction>,
    scratch_explosions: Vec<Explosion>,
    scratch_pending_hits: Vec<(u64, u64, f32)>,
    scratch_disconnected: SmallVec<[PlayerId; 4]>,
}

struct PlayerStore {
    conns: Vec<PlayerConn>,
    states: Vec<PlayerState>,
    player_index: HashMap<PlayerId, usize>,
}

impl PlayerStore {
    fn new() -> Self {
        Self {
            conns: Vec::new(),
            states: Vec::new(),
            player_index: HashMap::new(),
        }
    }

    fn len(&self) -> usize {
        self.conns.len()
    }

    fn is_empty(&self) -> bool {
        self.conns.is_empty()
    }

    fn player_mut_by_id(&mut self, player_id: PlayerId) -> Option<&mut PlayerConn> {
        let idx = self.player_index.get(&player_id).copied()?;
        Some(&mut self.conns[idx])
    }

    fn states_mut(&mut self) -> &mut [PlayerState] {
        &mut self.states
    }

    fn states(&self) -> &[PlayerState] {
        &self.states
    }

    fn conns(&self) -> &[PlayerConn] {
        &self.conns
    }

    fn contains(&self, player_id: PlayerId) -> bool {
        self.player_index.contains_key(&player_id)
    }

    fn player_tx(&self, player_id: PlayerId) -> Option<mpsc::Sender<Bytes>> {
        let idx = self.player_index.get(&player_id).copied()?;
        Some(self.conns[idx].tx.clone())
    }

    fn insert(&mut self, player: PlayerConn, state: PlayerState) {
        let idx = self.conns.len();
        self.player_index.insert(player.id, idx);
        self.conns.push(player);
        self.states.push(state);
    }

    fn remove(&mut self, player_id: PlayerId) -> bool {
        let Some(idx) = self.player_index.remove(&player_id) else {
            return false;
        };

        let last_idx = self.conns.len() - 1;
        self.conns.swap_remove(idx);
        self.states.swap_remove(idx);

        if idx != last_idx {
            let moved_id = self.conns[idx].id;
            self.player_index.insert(moved_id, idx);
        }

        true
    }

    fn validate(&self) {
        debug_assert_eq!(self.conns.len(), self.states.len());
        debug_assert_eq!(self.conns.len(), self.player_index.len());
        for (idx, player) in self.conns.iter().enumerate() {
            debug_assert_eq!(self.player_index.get(&player.id), Some(&idx));
        }
    }
}

impl RoomTask {
    fn new(
        room_id: RoomId,
        mut map: GameMap,
        config: RoomConfig,
        rx: mpsc::Receiver<RoomCmd>,
        server_started_at: Instant,
    ) -> Self {
        let seed = room_id.as_str().bytes().fold(0_u64, |acc, byte| {
            acc.wrapping_mul(31).wrapping_add(byte as u64)
        });
        let now = Instant::now();

        Self {
            room_id,
            items: map.take_items(),
            map: Arc::new(map),
            config,
            status: RoomStatus::Created,
            created_at: now,
            last_activity_at: now,
            server_started_at,
            close_reason: None,
            rx,
            tick: Tick(0),
            projectiles: Vec::new(),
            next_projectile_id: IdGen::default(),
            player_store: PlayerStore::new(),
            snapshot_encoder: SnapshotEncoder::new(),
            rng: ChaCha8Rng::seed_from_u64(seed),
            scratch_player_snapshots: Vec::new(),
            scratch_item_snapshots: Vec::new(),
            scratch_events: EventVec::new(),
            pending_snapshot_events: EventVec::new(),
            scratch_hit_actions: Vec::new(),
            scratch_explosions: Vec::new(),
            scratch_pending_hits: Vec::new(),
            scratch_disconnected: SmallVec::new(),
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
                    if self.handle_cmd(cmd) {
                        break;
                    }
                    self.drain_commands();
                }
                _ = tick_interval.tick() => {
                    self.drain_commands();
                    self.simulate_tick();
                    if self.status == RoomStatus::Closing {
                        break;
                    }
                }
            }
        }
        self.status = RoomStatus::Closed;
        info!(room_id = self.room_id.as_str(), "room closed");
    }

    fn drain_commands(&mut self) {
        while let Ok(cmd) = self.rx.try_recv() {
            if self.handle_cmd(cmd) {
                break;
            }
        }
    }

    fn handle_cmd(&mut self, cmd: RoomCmd) -> bool {
        match cmd {
            RoomCmd::Join {
                player_id,
                username,
                tx,
                response,
            } => {
                if matches!(self.status, RoomStatus::Closing | RoomStatus::Closed) {
                    let _ = response.send(Err(JoinError::RoomClosing));
                    return false;
                }
                if self.player_store.len() >= self.config.max_players
                    && !self.player_store.contains(player_id)
                {
                    let _ = response.send(Err(JoinError::RoomFull));
                    return false;
                }
                let join_result = self.handle_join(player_id, username, tx);
                let _ = response.send(Ok(join_result.room_state.clone()));
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
                    self.transition_empty_if_needed();
                }
            }
            RoomCmd::Kick {
                player_id,
                reason,
                response,
            } => {
                let player_tx = self.player_store.player_tx(player_id);
                let removed = self.remove_player(player_id);
                if removed {
                    self.broadcast(encode_player_left(player_id.0).into());
                    if let Some(player_tx) = player_tx {
                        let _ = player_tx.try_send(Bytes::from(encode_kicked(&reason)));
                    }
                    self.transition_empty_if_needed();
                }
                let _ = response.send(removed);
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
            RoomCmd::Summary { response } => {
                let _ = response.send(self.summary());
            }
            RoomCmd::Info { response } => {
                let players = self
                    .player_store
                    .conns()
                    .iter()
                    .map(|p| (p.id.0, p.username.clone()))
                    .collect();
                let _ = response.send(RoomInfo {
                    summary: self.summary(),
                    players,
                    tick: self.tick.0,
                });
            }
            RoomCmd::Rename { name } => {
                self.config.name = name;
                self.last_activity_at = Instant::now();
            }
            RoomCmd::SetMaxPlayers {
                max_players,
                response,
            } => {
                if max_players < self.player_store.len() {
                    let _ = response.send(Err("maxPlayers_lower_than_current_players".to_string()));
                } else {
                    self.config.max_players = max_players;
                    self.last_activity_at = Instant::now();
                    let _ = response.send(Ok(()));
                }
            }
            RoomCmd::BeginClose { reason } => {
                self.close_reason = Some(reason.clone());
                self.status = RoomStatus::Closing;
                let payload = Bytes::from(encode_room_closed(&reason));
                self.broadcast(payload);
                return true;
            }
            #[cfg(test)]
            RoomCmd::ContainsPlayer {
                player_id,
                response,
            } => {
                let _ = response.send(self.player_store.contains(player_id));
            }
        }
        false
    }

    fn summary(&self) -> RoomSummary {
        RoomSummary {
            room_id: self.room_id.as_str().to_string(),
            name: self.config.name.clone(),
            current_players: self.player_store.len(),
            max_players: self.config.max_players,
            map_id: self.config.map_id.clone(),
            mode: self.config.mode.clone(),
            status: self.status,
            created_at_ms: self
                .created_at
                .duration_since(self.server_started_at)
                .as_millis() as u64,
            last_activity_at_ms: self
                .last_activity_at
                .duration_since(self.server_started_at)
                .as_millis() as u64,
            protocol_version: self.config.protocol_version.clone(),
            region: self.config.region.clone(),
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

        self.status = RoomStatus::Running;
        self.last_activity_at = Instant::now();

        let room_state = Bytes::from(encode_room_state(
            self.room_id.as_str(),
            self.map.name.as_str(),
            self.player_store.conns(),
            self.player_store.states(),
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
            self.last_activity_at = Instant::now();
            self.player_store.validate();
        }
        removed
    }

    fn transition_empty_if_needed(&mut self) {
        if self.player_store.is_empty() {
            self.status = RoomStatus::Closing;
        }
    }

    fn simulate_tick(&mut self) {
        if self.player_store.is_empty() || self.status != RoomStatus::Running {
            return;
        }

        self.tick.0 = self.tick.0.wrapping_add(1);
        let map = self.map.as_ref();
        self.scratch_events.clear();
        self.scratch_hit_actions.clear();
        self.scratch_explosions.clear();

        for idx in 0..self.player_store.len() {
            let input = self.player_store.conns()[idx].input;
            let state = &mut self.player_store.states_mut()[idx];
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
            self.player_store.states_mut(),
            &mut self.scratch_events,
        );

        update_projectiles(
            map,
            &mut self.projectiles,
            &mut self.scratch_events,
            &mut self.scratch_explosions,
        );
        apply_projectile_hits(
            &mut self.projectiles,
            self.player_store.states_mut(),
            &mut self.scratch_events,
            &mut self.scratch_explosions,
        );
        apply_explosions(
            &self.scratch_explosions,
            self.player_store.states_mut(),
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

        process_item_pickups(self.player_store.states_mut(), &mut self.items);

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
            &[],
            &self.pending_snapshot_events,
        );
        self.pending_snapshot_events.clear();
        self.broadcast(payload);
    }

    fn build_snapshot_buffers(&mut self) {
        self.scratch_player_snapshots.clear();
        self.scratch_item_snapshots.clear();

        self.scratch_player_snapshots
            .reserve(self.player_store.len());
        for (idx, player) in self.player_store.conns().iter().enumerate() {
            self.scratch_player_snapshots
                .push(player_snapshot_from_state(
                    player.last_input_seq,
                    &self.player_store.states()[idx],
                ));
        }

        self.scratch_item_snapshots.reserve(self.items.len());
        for item in &self.items {
            self.scratch_item_snapshots.push(ItemSnapshot {
                active: item.active,
                respawn_timer: item.respawn_timer as i16,
            });
        }
    }

    fn broadcast(&mut self, payload: Bytes) {
        self.scratch_disconnected.clear();
        for player in self.player_store.conns() {
            match player.tx.try_send(payload.clone()) {
                Ok(()) => {}
                Err(err) => {
                    let disconnected_id = player.id;
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
                    self.scratch_disconnected.push(disconnected_id);
                }
            }
        }

        while let Some(disconnected_id) = self.scratch_disconnected.pop() {
            if self.remove_player(disconnected_id) {
                let left_payload = Bytes::from(encode_player_left(disconnected_id.0));
                self.broadcast_after_disconnect(left_payload);
            }
        }

        self.transition_empty_if_needed();
    }

    fn broadcast_after_disconnect(&mut self, payload: Bytes) {
        for player in self.player_store.conns() {
            let _ = player.tx.try_send(payload.clone());
        }
    }

    fn broadcast_except(&mut self, payload: Bytes, skip_player_id: PlayerId) {
        for player in self.player_store.conns() {
            if player.id == skip_player_id {
                continue;
            }
            let _ = player.tx.try_send(payload.clone());
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

    use super::{PlayerId, RoomConfig, RoomHandle, RoomId};
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

    fn cfg(name: &str, max_players: usize) -> RoomConfig {
        RoomConfig {
            name: name.to_string(),
            max_players,
            map_id: "test".to_string(),
            mode: "dm".to_string(),
            tick_rate: 60,
            protocol_version: "1".to_string(),
            region: None,
        }
    }

    #[tokio::test]
    async fn join_is_idempotent_and_leave_removes_player() {
        let room = RoomHandle::new(
            RoomId::from("room-test"),
            simple_map(),
            cfg("room-test", 8),
            Instant::now(),
        );
        let (tx, _rx) = mpsc::channel::<Bytes>(4);

        let first = room
            .join(PlayerId(10), "alice".to_string(), tx.clone())
            .await;
        assert!(first.is_ok());
        assert!(room.contains_player(PlayerId(10)).await);

        let second = room.join(PlayerId(10), "alice".to_string(), tx).await;
        assert!(second.is_ok());
        assert!(room.contains_player(PlayerId(10)).await);

        room.leave(PlayerId(10));
        tokio::task::yield_now().await;
        assert!(!room.contains_player(PlayerId(10)).await);
    }
}
