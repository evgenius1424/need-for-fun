use serde::{Deserialize, Serialize};
use std::string::FromUtf8Error;

use crate::constants::WEAPON_COUNT;

#[derive(Debug)]
pub enum DecodeError {
    Empty,
    UnknownType(u8),
    OutOfBounds,
    InvalidUtf8,
}

impl From<FromUtf8Error> for DecodeError {
    fn from(_: FromUtf8Error) -> Self {
        Self::InvalidUtf8
    }
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::Empty => write!(f, "empty buffer"),
            DecodeError::UnknownType(t) => write!(f, "unknown message type: {:#x}", t),
            DecodeError::OutOfBounds => write!(f, "buffer too short"),
            DecodeError::InvalidUtf8 => write!(f, "invalid UTF-8"),
        }
    }
}

impl std::error::Error for DecodeError {}

// Client-to-server messages
#[derive(Debug, Clone, Deserialize)]
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

// Server-to-client messages (for JS serialization via serde)
#[derive(Debug, Clone, Serialize)]
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
        projectiles: Vec<ProjectileStateJs>,
        events: Vec<EffectEventJs>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: u64,
    pub username: String,
    pub model: Option<String>,
    pub skin: Option<String>,
    pub state: Option<PlayerSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub weapons: [bool; WEAPON_COUNT],
    pub ammo: [i32; WEAPON_COUNT],
    pub last_input_seq: u64,
    pub key_left: bool,
    pub key_right: bool,
    pub key_up: bool,
    pub key_down: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemState {
    pub active: bool,
    pub respawn_timer: i16,
}

// JS-facing types with String kind for serde serialization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectileStateJs {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub owner_id: i64,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EffectEventJs {
    WeaponFired {
        player_id: u64,
        weapon_id: i32,
    },
    ProjectileSpawn {
        id: u64,
        kind: String,
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
        kind: String,
    },
    Damage {
        attacker_id: u64,
        target_id: u64,
        amount: i32,
        killed: bool,
    },
}

// Server-side types with u8 kind for encoding
#[derive(Debug, Clone, Serialize)]
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

// Internal types for binary encoding
#[derive(Clone, Copy, Debug)]
pub struct ItemSnapshot {
    pub active: bool,
    pub respawn_timer: i16,
}

#[derive(Clone, Copy, Debug)]
pub struct ProjectileSnapshot {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub owner_id: i64,
    pub kind: u8,
}
