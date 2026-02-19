// Message type constants
pub const MSG_HELLO: u8 = 0x01;
pub const MSG_JOIN_ROOM: u8 = 0x02;
pub const MSG_INPUT: u8 = 0x03;
pub const MSG_PING: u8 = 0x04;
pub const MSG_WELCOME: u8 = 0x81;
pub const MSG_ROOM_STATE: u8 = 0x82;
pub const MSG_PLAYER_JOINED: u8 = 0x83;
pub const MSG_PLAYER_LEFT: u8 = 0x84;
pub const MSG_SNAPSHOT: u8 = 0x85;
pub const MSG_PONG: u8 = 0x86;
pub const MSG_JOIN_REJECTED: u8 = 0x87;
pub const MSG_ROOM_CLOSED: u8 = 0x88;
pub const MSG_KICKED: u8 = 0x89;

// Event type constants
pub const EVENT_WEAPON_FIRED: u8 = 0x01;
pub const EVENT_PROJECTILE_SPAWN: u8 = 0x02;
pub const EVENT_RAIL: u8 = 0x03;
pub const EVENT_SHAFT: u8 = 0x04;
pub const EVENT_BULLET_IMPACT: u8 = 0x05;
pub const EVENT_GAUNTLET: u8 = 0x06;
pub const EVENT_EXPLOSION: u8 = 0x07;
pub const EVENT_DAMAGE: u8 = 0x08;
pub const EVENT_PROJECTILE_REMOVE: u8 = 0x09;

// Protocol limits
pub const MAX_USERNAME_LEN: usize = 32;
pub const WEAPON_COUNT: usize = 9;

// Projectile kind constants for JS interop
pub const PROJ_ROCKET: u8 = 0;
pub const PROJ_GRENADE: u8 = 1;
pub const PROJ_PLASMA: u8 = 2;
pub const PROJ_BFG: u8 = 3;
