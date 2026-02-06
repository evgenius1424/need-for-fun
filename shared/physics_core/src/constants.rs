pub const TICK_MILLIS: u64 = 16;
pub const WEAPON_COUNT: usize = 9;

pub const TILE_W: f32 = 32.0;
pub const TILE_H: f32 = 16.0;

pub const PLAYER_HALF_W: f32 = 9.0;
pub const PLAYER_HALF_H: f32 = 24.0;
pub const PLAYER_CROUCH_HALF_W: f32 = 8.0;
pub const PLAYER_CROUCH_HALF_H: f32 = 8.0;

pub const PLAYER_MAX_VELOCITY_X: f32 = 3.0;
pub const PLAYER_VELOCITY_CLAMP: f32 = 5.0;

pub const GROUND_PROBE: f32 = 25.0;
pub const HEAD_PROBE: f32 = 25.0;
pub const CROUCH_HEAD_PROBE: f32 = 9.0;
pub const WALL_PROBE_X_LEFT: f32 = -11.0;
pub const WALL_PROBE_X_RIGHT: f32 = 11.0;
pub const WALL_SNAP_LEFT: f32 = 9.0;
pub const WALL_SNAP_RIGHT: f32 = 22.0;
pub const CROUCH_HEAD_OFFSET: f32 = 8.0;
pub const STAND_HEAD_OFFSET: f32 = 16.0;

pub const SPEED_JUMP_Y: [f32; 7] = [0.0, 0.0, 0.4, 0.8, 1.0, 1.2, 1.4];
pub const SPEED_JUMP_X: [f32; 7] = [0.0, 0.33, 0.8, 1.1, 1.4, 1.8, 2.2];

pub const DEFAULT_AMMO: [i32; WEAPON_COUNT] = [-1, 100, 10, 5, 20, 10, 30, 50, 10];
