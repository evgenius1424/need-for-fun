#![forbid(unsafe_code)]
#![deny(rust_2018_idioms)]

pub mod constants;
pub mod decode;
pub mod encode;
pub mod types;

#[cfg(feature = "wasm")]
pub mod wasm;

// Re-export commonly used items
pub use constants::*;
pub use decode::{decode_client_message, decode_server_message};
pub use encode::{
    encode_event, encode_hello, encode_input, encode_join_room, encode_player_joined,
    encode_player_left, encode_player_record, encode_room_state, encode_snapshot, encode_welcome,
    kind_u8_to_str,
};
pub use types::{
    ClientMsg, DecodeError, EffectEvent, EffectEventJs, ItemSnapshot, ItemState, PlayerInfo,
    PlayerSnapshot, ProjectileSnapshot, ProjectileStateJs, ServerMsg,
};
