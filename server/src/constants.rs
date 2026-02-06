pub use physics_core::constants::WEAPON_COUNT;
pub use physics_core::constants::{PLAYER_HALF_H, TILE_H, TILE_W};

// Re-export projectile/weapon constants from physics_core
pub use physics_core::constants::{
    BOUNCE_DECAY, BOUNDS_MARGIN, DAMAGE, EXPLOSION_RADIUS, FIRE_RATE, GAUNTLET_PLAYER_RADIUS,
    GAUNTLET_RANGE, GRENADE_FUSE, GRENADE_HIT_GRACE, GRENADE_LOFT, GRENADE_MIN_VELOCITY,
    HITSCAN_PLAYER_RADIUS, MACHINE_RANGE, PICKUP_RADIUS, PROJECTILE_GRAVITY, PROJECTILE_SPEED,
    RAIL_RANGE, SELF_HIT_GRACE, SHAFT_RANGE, SHOTGUN_PELLETS, SHOTGUN_RANGE, SHOTGUN_SPREAD,
};

pub const DEFAULT_PORT: &str = "3001";
pub const DEFAULT_ROOM_ID: &str = "room-1";
pub const DEFAULT_MAP_NAME: &str = "dm2";
pub const DEFAULT_MAP_DIR: &str = "../public/maps";

pub const TICK_MILLIS: u64 = 16;
pub const OUTBOUND_CHANNEL_CAPACITY: usize = 64;
pub const ROOM_COMMAND_CAPACITY: usize = 1024;

pub const SNAPSHOT_BUFFER_RING: usize = 8;
