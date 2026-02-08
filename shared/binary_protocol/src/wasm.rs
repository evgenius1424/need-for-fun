#![cfg(feature = "wasm")]

use wasm_bindgen::prelude::*;

use crate::constants::*;
use crate::decode::decode_server_message;
use crate::encode::{encode_hello, encode_input, encode_join_room};

#[wasm_bindgen]
pub fn wasm_encode_hello(username: &str) -> Vec<u8> {
    encode_hello(username)
}

#[wasm_bindgen]
pub fn wasm_encode_join_room(room_id: &str, map: &str) -> Vec<u8> {
    encode_join_room(room_id, map)
}

#[wasm_bindgen]
pub fn wasm_encode_input(
    seq: u64,
    aim_angle: f32,
    key_up: bool,
    key_down: bool,
    key_left: bool,
    key_right: bool,
    mouse_down: bool,
    facing_left: bool,
    weapon_switch: i8,
    weapon_scroll: i8,
) -> Vec<u8> {
    encode_input(
        seq,
        aim_angle,
        key_up,
        key_down,
        key_left,
        key_right,
        mouse_down,
        facing_left,
        weapon_switch,
        weapon_scroll,
    )
}

#[wasm_bindgen]
pub fn wasm_decode_server_message(buffer: &[u8]) -> JsValue {
    match decode_server_message(buffer) {
        Ok(msg) => serde_wasm_bindgen::to_value(&msg).unwrap_or(JsValue::NULL),
        Err(_) => JsValue::NULL,
    }
}

#[wasm_bindgen]
pub fn get_protocol_constants() -> JsValue {
    let constants = serde_wasm_bindgen::to_value(&ProtocolConstants {
        msg: MsgConstants {
            hello: MSG_HELLO,
            join_room: MSG_JOIN_ROOM,
            input: MSG_INPUT,
            welcome: MSG_WELCOME,
            room_state: MSG_ROOM_STATE,
            player_joined: MSG_PLAYER_JOINED,
            player_left: MSG_PLAYER_LEFT,
            snapshot: MSG_SNAPSHOT,
        },
        event: EventConstants {
            weapon_fired: EVENT_WEAPON_FIRED,
            projectile_spawn: EVENT_PROJECTILE_SPAWN,
            rail: EVENT_RAIL,
            shaft: EVENT_SHAFT,
            bullet_impact: EVENT_BULLET_IMPACT,
            gauntlet: EVENT_GAUNTLET,
            explosion: EVENT_EXPLOSION,
            damage: EVENT_DAMAGE,
        },
        proj: ProjConstants {
            rocket: PROJ_ROCKET,
            grenade: PROJ_GRENADE,
            plasma: PROJ_PLASMA,
            bfg: PROJ_BFG,
        },
    });
    constants.unwrap_or(JsValue::NULL)
}

#[derive(serde::Serialize)]
struct ProtocolConstants {
    msg: MsgConstants,
    event: EventConstants,
    proj: ProjConstants,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
struct MsgConstants {
    hello: u8,
    join_room: u8,
    input: u8,
    welcome: u8,
    room_state: u8,
    player_joined: u8,
    player_left: u8,
    snapshot: u8,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
struct EventConstants {
    weapon_fired: u8,
    projectile_spawn: u8,
    rail: u8,
    shaft: u8,
    bullet_impact: u8,
    gauntlet: u8,
    explosion: u8,
    damage: u8,
}

#[derive(serde::Serialize)]
struct ProjConstants {
    rocket: u8,
    grenade: u8,
    plasma: u8,
    bfg: u8,
}
