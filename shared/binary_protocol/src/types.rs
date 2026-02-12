use std::string::FromUtf8Error;

use crate::constants::WEAPON_COUNT;

#[derive(Debug, Clone)]
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
    Ping {
        client_time_ms: u64,
    },
}

#[derive(Debug, Clone, Copy)]
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

#[derive(Debug, Clone, Copy)]
pub struct ItemSnapshot {
    pub active: bool,
    pub respawn_timer: i16,
}

#[derive(Debug, Clone, Copy)]
pub struct ProjectileSnapshot {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub owner_id: i64,
    pub kind: u8,
}

#[derive(Debug, Clone)]
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
    ProjectileRemove {
        id: u64,
        x: f32,
        y: f32,
        kind: u8,
    },
}

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
