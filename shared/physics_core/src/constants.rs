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

// Projectile physics
pub const PROJECTILE_GRAVITY: f32 = 0.18;
pub const BOUNCE_DECAY: f32 = 0.75;
pub const GRENADE_FUSE: i32 = 120;
pub const GRENADE_MIN_VELOCITY: f32 = 0.5;
pub const BOUNDS_MARGIN: f32 = 100.0;
pub const SELF_HIT_GRACE: i32 = 8;
pub const GRENADE_HIT_GRACE: i32 = 12;
pub const EXPLOSION_RADIUS: f32 = 90.0;

// Weapon constants
pub const GRENADE_LOFT: f32 = 2.0;
pub const SHOTGUN_PELLETS: usize = 11;
pub const SHOTGUN_SPREAD: f32 = 0.15;
pub const SHOTGUN_RANGE: f32 = 800.0;
pub const GAUNTLET_RANGE: f32 = 50.0;
pub const SHAFT_RANGE: f32 = TILE_W * 3.0;
pub const MACHINE_RANGE: f32 = 1000.0;
pub const RAIL_RANGE: f32 = 2000.0;
pub const HITSCAN_PLAYER_RADIUS: f32 = 14.0;
pub const GAUNTLET_PLAYER_RADIUS: f32 = 22.0;
pub const PICKUP_RADIUS: f32 = 16.0;

// Hit radii for projectiles
pub const HIT_RADIUS_ROCKET: f32 = 28.0;
pub const HIT_RADIUS_BFG: f32 = 28.0;
pub const HIT_RADIUS_GRENADE: f32 = 16.0;
pub const HIT_RADIUS_PLASMA: f32 = 20.0;

// Weapon damage values (Gauntlet, Machine, Shotgun, Grenade, Rocket, Rail, Plasma, Shaft, Bfg)
pub const DAMAGE: [f32; WEAPON_COUNT] = [35.0, 5.0, 7.0, 65.0, 100.0, 75.0, 14.0, 3.0, 100.0];

// Projectile speeds (only for projectile weapons, others are 0)
pub const PROJECTILE_SPEED: [f32; WEAPON_COUNT] = [0.0, 0.0, 0.0, 5.0, 6.0, 0.0, 7.0, 0.0, 7.0];

// Fire rate in ticks
pub const FIRE_RATE: [i32; WEAPON_COUNT] = [25, 5, 50, 45, 40, 85, 5, 1, 100];
