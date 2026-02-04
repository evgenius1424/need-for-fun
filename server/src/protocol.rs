use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    Hello {
        username: String,
    },
    JoinRoom {
        room_id: Option<String>,
        map: Option<String>,
    },
    Input {
        seq: u64,
        key_up: bool,
        key_down: bool,
        key_left: bool,
        key_right: bool,
        mouse_down: bool,
        weapon_switch: i32,
        weapon_scroll: i32,
        aim_angle: f32,
        facing_left: bool,
    },
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Welcome {
        player_id: u64,
    },
    RoomState {
        room_id: String,
        map: String,
        players: Vec<PlayerInfo>,
    },
    PlayerJoined {
        player: PlayerInfo,
    },
    PlayerLeft {
        player_id: u64,
    },
    Snapshot {
        tick: u64,
        players: Vec<PlayerSnapshot>,
        items: Vec<ItemState>,
        projectiles: Vec<ProjectileState>,
        events: Vec<EffectEvent>,
    },
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Clone)]
pub struct PlayerInfo {
    pub id: u64,
    pub username: String,
    pub model: Option<String>,
    pub skin: Option<String>,
    pub state: Option<PlayerSnapshot>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PlayerSnapshot {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub aim_angle: f32,
    pub facing_left: bool,
    pub crouch: bool,
    pub dead: bool,
    pub health: i32,
    pub armor: i32,
    pub current_weapon: i32,
    pub fire_cooldown: i32,
    pub weapons: [bool; crate::constants::WEAPON_COUNT],
    pub ammo: [i32; crate::constants::WEAPON_COUNT],
    pub last_input_seq: u64,
    pub key_left: bool,
    pub key_right: bool,
    pub key_up: bool,
    pub key_down: bool,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Clone)]
pub struct ItemState {
    pub active: bool,
    pub respawn_timer: i32,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Clone)]
pub struct ProjectileState {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub owner_id: i64,
    #[serde(rename = "type")]
    pub kind: u8,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EffectEvent {
    WeaponFired {
        player_id: u64,
        weapon_id: i32,
    },
    ProjectileSpawn {
        id: u64,
        kind: u8,
        x: f32,
        y: f32,
        velocity_x: f32,
        velocity_y: f32,
        owner_id: u64,
    },
    Rail {
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    },
    Shaft {
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    },
    BulletImpact {
        x: f32,
        y: f32,
        radius: f32,
    },
    Gauntlet {
        x: f32,
        y: f32,
    },
    Explosion {
        x: f32,
        y: f32,
        kind: u8,
    },
    Damage {
        attacker_id: u64,
        target_id: u64,
        amount: i32,
        killed: bool,
    },
}
