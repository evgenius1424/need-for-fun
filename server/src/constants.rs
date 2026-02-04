pub const WEAPON_COUNT: usize = 9;

pub const DEFAULT_PORT: &str = "3001";
pub const DEFAULT_ROOM_ID: &str = "room-1";
pub const DEFAULT_MAP_NAME: &str = "dm2";
pub const DEFAULT_MAP_DIR: &str = "../public/maps";

pub const TICK_MILLIS: u64 = 16;
pub const OUTBOUND_CHANNEL_CAPACITY: usize = 64;
pub const ROOM_COMMAND_CAPACITY: usize = 1024;

pub const TILE_W: f32 = 32.0;
pub const TILE_H: f32 = 16.0;
pub const PLAYER_HALF_W: f32 = 9.0;
pub const PLAYER_HALF_H: f32 = 24.0;
pub const PLAYER_CROUCH_HALF_H: f32 = 8.0;
