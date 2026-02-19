use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use bytes::Bytes;
use futures_util::future::join_all;
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::info;
use uuid::Uuid;

use crate::binary::encode_join_rejected;
use crate::map::GameMap;
use crate::room::{PlayerId, RoomConfig, RoomHandle, RoomId, RoomInfo, RoomSummary};

pub const ROOM_MAX_PLAYERS_HARD_CAP: usize = 8;

#[derive(Default)]
pub struct RoomMetrics {
    pub rooms_created_total: AtomicU64,
    pub rooms_closed_total: AtomicU64,
    pub players_joined_total: AtomicU64,
    pub players_left_total: AtomicU64,
}

pub struct RoomManager {
    rooms: RwLock<HashMap<RoomId, Arc<RoomHandle>>>,
    names: RwLock<HashMap<String, RoomId>>,
    player_rooms: Mutex<HashMap<PlayerId, RoomId>>,
    pub metrics: RoomMetrics,
    server_started_at: Instant,
}

pub struct JoinSuccess {
    pub room: Arc<RoomHandle>,
    pub room_state: Bytes,
}

impl RoomManager {
    pub fn new(server_started_at: Instant) -> Self {
        Self {
            rooms: RwLock::new(HashMap::new()),
            names: RwLock::new(HashMap::new()),
            player_rooms: Mutex::new(HashMap::new()),
            metrics: RoomMetrics::default(),
            server_started_at,
        }
    }

    pub async fn create_room(
        &self,
        config: RoomConfig,
        map: GameMap,
    ) -> Result<Arc<RoomHandle>, String> {
        self.create_room_locked(config, map).await
    }

    pub async fn get_or_create_room(
        &self,
        config: RoomConfig,
        map: GameMap,
    ) -> Result<Arc<RoomHandle>, String> {
        if config.max_players == 0 || config.max_players > ROOM_MAX_PLAYERS_HARD_CAP {
            return Err(format!(
                "maxPlayers must be 1..={ROOM_MAX_PLAYERS_HARD_CAP}"
            ));
        }

        let mut rooms = self.rooms.write().await;
        let mut names = self.names.write().await;

        if let Some(room_id) = names.get(&config.name) {
            if let Some(room) = rooms.get(room_id) {
                return Ok(Arc::clone(room));
            }
            names.remove(&config.name);
        }

        let room_id = RoomId::from(Uuid::new_v4().simple().to_string());
        let room = RoomHandle::new(room_id.clone(), map, config.clone(), self.server_started_at);
        rooms.insert(room_id.clone(), Arc::clone(&room));
        names.insert(config.name, room_id);
        self.metrics
            .rooms_created_total
            .fetch_add(1, Ordering::Relaxed);
        Ok(room)
    }

    async fn create_room_locked(
        &self,
        config: RoomConfig,
        map: GameMap,
    ) -> Result<Arc<RoomHandle>, String> {
        if config.max_players == 0 || config.max_players > ROOM_MAX_PLAYERS_HARD_CAP {
            return Err(format!(
                "maxPlayers must be 1..={ROOM_MAX_PLAYERS_HARD_CAP}"
            ));
        }

        let mut rooms = self.rooms.write().await;
        let mut names = self.names.write().await;

        if names.contains_key(&config.name) {
            return Err("room_name_already_exists".to_string());
        }

        let room_id = RoomId::from(Uuid::new_v4().simple().to_string());
        let room = RoomHandle::new(room_id.clone(), map, config.clone(), self.server_started_at);
        rooms.insert(room_id.clone(), Arc::clone(&room));
        names.insert(config.name, room_id);
        self.metrics
            .rooms_created_total
            .fetch_add(1, Ordering::Relaxed);
        Ok(room)
    }

    pub async fn list_rooms(&self) -> Vec<RoomSummary> {
        let handles: Vec<Arc<RoomHandle>> = self.rooms.read().await.values().cloned().collect();
        let mut rooms: Vec<RoomSummary> = join_all(
            handles
                .into_iter()
                .map(|room| async move { room.summary().await }),
        )
        .await
        .into_iter()
        .flatten()
        .filter(|room| room.status.as_str() != "closed")
        .collect();

        rooms.sort_by(|a, b| {
            a.status
                .rank()
                .cmp(&b.status.rank())
                .then(b.current_players.cmp(&a.current_players))
                .then(b.last_activity_at_ms.cmp(&a.last_activity_at_ms))
        });
        rooms
    }

    pub async fn get_room_by_ref(&self, room_ref: &str) -> Option<Arc<RoomHandle>> {
        let rooms = self.rooms.read().await;
        let direct_id = RoomId::from(room_ref);
        if let Some(room) = rooms.get(&direct_id) {
            return Some(Arc::clone(room));
        }

        let names = self.names.read().await;
        let mapped_id = names.get(room_ref)?;
        rooms.get(mapped_id).cloned()
    }

    pub async fn join_room(
        &self,
        player_id: PlayerId,
        username: String,
        target_room: Arc<RoomHandle>,
        tx: mpsc::Sender<Bytes>,
    ) -> Result<JoinSuccess, Bytes> {
        self.leave_player(player_id).await;

        match target_room.join(player_id, username, tx).await {
            Ok(room_state) => {
                self.player_rooms
                    .lock()
                    .await
                    .insert(player_id, target_room.id().clone());
                self.metrics
                    .players_joined_total
                    .fetch_add(1, Ordering::Relaxed);
                Ok(JoinSuccess {
                    room: target_room,
                    room_state,
                })
            }
            Err(err) => Err(Bytes::from(encode_join_rejected(err.reason()))),
        }
    }

    pub async fn leave_player(&self, player_id: PlayerId) {
        if let Some(room_id) = self.player_rooms.lock().await.remove(&player_id) {
            if let Some(room) = self.rooms.read().await.get(&room_id).cloned() {
                room.leave(player_id);
                self.metrics
                    .players_left_total
                    .fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    fn room_id_from_ref(names: &HashMap<String, RoomId>, room_ref: &str) -> Option<RoomId> {
        if let Some(id) = names.get(room_ref) {
            return Some(id.clone());
        }
        Some(RoomId::from(room_ref))
    }

    pub async fn close_room(&self, room_ref: &str, reason: &str) -> Result<(), String> {
        let mut rooms = self.rooms.write().await;
        let mut names = self.names.write().await;

        let room_id =
            Self::room_id_from_ref(&names, room_ref).ok_or_else(|| "room_not_found".to_string())?;
        let room = rooms
            .remove(&room_id)
            .ok_or_else(|| "room_not_found".to_string())?;

        let dropped_name = names.iter().find_map(|(name, id)| {
            if id == &room_id {
                Some(name.clone())
            } else {
                None
            }
        });
        if let Some(name) = dropped_name {
            names.remove(&name);
        }

        self.player_rooms
            .lock()
            .await
            .retain(|_, mapped_room_id| mapped_room_id != &room_id);

        drop(names);
        drop(rooms);
        room.begin_close(reason.to_string()).await?;
        self.metrics
            .rooms_closed_total
            .fetch_add(1, Ordering::Relaxed);
        info!(room_id = room_id.as_str(), reason, "room force-closed");
        Ok(())
    }

    pub async fn room_info(&self, room_ref: &str) -> Option<RoomInfo> {
        let room = self.get_room_by_ref(room_ref).await?;
        room.info().await
    }

    pub async fn rename_room(&self, room_ref: &str, new_name: String) -> Result<(), String> {
        let rooms = self.rooms.write().await;
        let mut names = self.names.write().await;

        if names.contains_key(&new_name) {
            return Err("room_name_already_exists".to_string());
        }

        let room_id =
            Self::room_id_from_ref(&names, room_ref).ok_or_else(|| "room_not_found".to_string())?;
        let room = rooms
            .get(&room_id)
            .cloned()
            .ok_or_else(|| "room_not_found".to_string())?;

        let old_name = names
            .iter()
            .find_map(|(name, id)| {
                if id == &room_id {
                    Some(name.clone())
                } else {
                    None
                }
            })
            .ok_or_else(|| "room_not_found".to_string())?;

        names.remove(&old_name);
        names.insert(new_name.clone(), room_id);

        drop(names);
        drop(rooms);
        room.rename(new_name);
        Ok(())
    }

    pub async fn set_room_max_players(&self, room_ref: &str, n: usize) -> Result<(), String> {
        if n == 0 || n > ROOM_MAX_PLAYERS_HARD_CAP {
            return Err(format!(
                "maxPlayers must be 1..={ROOM_MAX_PLAYERS_HARD_CAP}"
            ));
        }

        let room = self
            .get_room_by_ref(room_ref)
            .await
            .ok_or_else(|| "room_not_found".to_string())?;
        room.set_max_players(n).await
    }

    pub async fn move_player(
        &self,
        player_id: PlayerId,
        target_room_ref: &str,
        username: String,
        tx: mpsc::Sender<Bytes>,
    ) -> Result<JoinSuccess, Bytes> {
        let target_room = self
            .get_room_by_ref(target_room_ref)
            .await
            .ok_or_else(|| Bytes::from(encode_join_rejected("room_not_found")))?;
        self.join_room(player_id, username, target_room, tx).await
    }

    pub async fn kick(
        &self,
        room_ref: &str,
        player_id: PlayerId,
        reason: String,
    ) -> Result<bool, String> {
        let room = self
            .get_room_by_ref(room_ref)
            .await
            .ok_or_else(|| "room_not_found".to_string())?;
        Ok(room.kick(player_id, reason).await)
    }

    pub async fn current_rooms(&self) -> usize {
        self.rooms.read().await.len()
    }

    pub async fn current_players(&self) -> usize {
        self.player_rooms.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Instant;

    use bytes::Bytes;
    use tokio::sync::mpsc;

    use super::RoomManager;
    use crate::map::GameMap;
    use crate::room::{PlayerId, RoomConfig};

    fn map() -> GameMap {
        GameMap {
            rows: 1,
            cols: 1,
            bricks: vec![0],
            respawns: vec![(0, 0)],
            items: Vec::new(),
            name: "dm2".to_string(),
        }
    }

    fn config(name: &str, max: usize) -> RoomConfig {
        RoomConfig {
            name: name.to_string(),
            max_players: max,
            map_id: "dm2".to_string(),
            mode: "deathmatch".to_string(),
            tick_rate: 60,
            protocol_version: "1".to_string(),
            region: None,
        }
    }

    #[tokio::test]
    async fn create_list_and_close_room() {
        let manager = RoomManager::new(Instant::now());
        let room = manager.create_room(config("alpha", 2), map()).await;
        assert!(room.is_ok());

        let rooms = manager.list_rooms().await;
        assert_eq!(rooms.len(), 1);

        let close_result = manager.close_room("alpha", "admin_close").await;
        assert!(close_result.is_ok());
        assert_eq!(manager.current_rooms().await, 0);
    }

    #[tokio::test]
    async fn join_until_full() {
        let manager = RoomManager::new(Instant::now());
        let room = manager
            .create_room(config("beta", 1), map())
            .await
            .expect("room create");
        let (tx1, _rx1) = mpsc::channel::<Bytes>(4);
        let (tx2, _rx2) = mpsc::channel::<Bytes>(4);

        let first = manager
            .join_room(PlayerId(1), "p1".to_string(), room.clone(), tx1)
            .await;
        assert!(first.is_ok());
        let second = manager
            .join_room(PlayerId(2), "p2".to_string(), room, tx2)
            .await;
        assert!(second.is_err());
    }

    #[tokio::test]
    async fn concurrent_join_respects_capacity() {
        let manager = Arc::new(RoomManager::new(Instant::now()));
        let room = manager
            .create_room(config("gamma", 2), map())
            .await
            .expect("room create");

        let mut tasks = Vec::new();
        for player in 0..6_u64 {
            let manager = Arc::clone(&manager);
            let room = Arc::clone(&room);
            tasks.push(tokio::spawn(async move {
                let (tx, _rx) = mpsc::channel::<Bytes>(2);
                manager
                    .join_room(PlayerId(player), format!("p{player}"), room, tx)
                    .await
                    .is_ok()
            }));
        }

        let mut joined = 0;
        for task in tasks {
            if task.await.unwrap_or(false) {
                joined += 1;
            }
        }
        assert_eq!(joined, 2);
    }

    #[tokio::test]
    async fn leave_last_player_triggers_auto_close_flow() {
        let manager = RoomManager::new(Instant::now());
        let room = manager
            .create_room(config("delta", 2), map())
            .await
            .expect("room create");
        let (tx, _rx) = mpsc::channel::<Bytes>(4);
        let joined = manager
            .join_room(PlayerId(7), "p7".to_string(), room, tx)
            .await;
        assert!(joined.is_ok());

        manager.leave_player(PlayerId(7)).await;
        tokio::task::yield_now().await;
        let info = manager.room_info("delta").await.expect("room info");
        assert_eq!(info.summary.status.as_str(), "closing");
    }

    #[tokio::test]
    async fn disconnect_cleanup_reuses_leave_path() {
        let manager = RoomManager::new(Instant::now());
        let room = manager
            .create_room(config("epsilon", 2), map())
            .await
            .expect("room create");
        let (tx, _rx) = mpsc::channel::<Bytes>(4);
        let joined = manager
            .join_room(PlayerId(9), "p9".to_string(), room, tx)
            .await;
        assert!(joined.is_ok());

        manager.leave_player(PlayerId(9)).await;
        assert_eq!(manager.current_players().await, 0);
    }

    #[tokio::test]
    async fn moving_between_rooms_clears_old_membership() {
        let manager = RoomManager::new(Instant::now());
        let room_a = manager
            .create_room(config("a", 8), map())
            .await
            .expect("room a");
        let room_b = manager
            .create_room(config("b", 8), map())
            .await
            .expect("room b");

        let (tx, _rx) = mpsc::channel::<Bytes>(8);

        let joined_a = manager
            .join_room(
                PlayerId(77),
                "p77".to_string(),
                Arc::clone(&room_a),
                tx.clone(),
            )
            .await;
        assert!(joined_a.is_ok());
        assert!(room_a.contains_player(PlayerId(77)).await);

        let joined_b = manager
            .join_room(PlayerId(77), "p77".to_string(), Arc::clone(&room_b), tx)
            .await;
        assert!(joined_b.is_ok());

        tokio::task::yield_now().await;
        assert!(!room_a.contains_player(PlayerId(77)).await);
        assert!(room_b.contains_player(PlayerId(77)).await);
    }
}
