#![forbid(unsafe_code)]
#![deny(rust_2018_idioms)]

pub mod constants;
pub mod decode;
pub mod encode;
pub mod types;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use constants::*;
pub use decode::decode_client_message;
pub use encode::{
    encode_hello, encode_input, encode_join_room, encode_player_joined, encode_player_left,
    encode_room_state, encode_snapshot, encode_welcome, kind_u8_to_str, write_event,
    write_player_record, BinaryWriter,
};
pub use types::{ClientMsg, DecodeError, EffectEvent, ItemSnapshot, PlayerSnapshot, ProjectileSnapshot};
