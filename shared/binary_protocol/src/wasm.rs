#![cfg(feature = "wasm")]

use js_sys::{Array, Object, Reflect};
use wasm_bindgen::prelude::*;

use crate::constants::*;
use crate::encode::{encode_hello, encode_input, encode_join_room, kind_u8_to_str};

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
    encode_input(seq, aim_angle, key_up, key_down, key_left, key_right, mouse_down, facing_left, weapon_switch, weapon_scroll)
}

#[wasm_bindgen]
pub fn wasm_decode_server_message(buffer: &[u8]) -> JsValue {
    if buffer.is_empty() {
        return JsValue::NULL;
    }
    match buffer[0] {
        MSG_WELCOME => decode_welcome_js(buffer),
        MSG_ROOM_STATE => decode_room_state_js(buffer),
        MSG_PLAYER_JOINED => decode_player_joined_js(buffer),
        MSG_PLAYER_LEFT => decode_player_left_js(buffer),
        MSG_SNAPSHOT => decode_snapshot_js(buffer),
        _ => JsValue::NULL,
    }
}

fn decode_welcome_js(bytes: &[u8]) -> JsValue {
    if bytes.len() < 9 { return JsValue::NULL; }
    let player_id = read_u64(bytes, 1);
    let obj = Object::new();
    set_str(&obj, "type", "welcome");
    set_f64(&obj, "player_id", player_id as f64);
    obj.into()
}

fn decode_room_state_js(bytes: &[u8]) -> JsValue {
    if bytes.len() < 4 { return JsValue::NULL; }
    let room_len = bytes[1] as usize;
    let map_len = bytes[2] as usize;
    let player_count = bytes[3] as usize;
    let mut offset = 4;
    if bytes.len() < offset + room_len + map_len { return JsValue::NULL; }
    let room_id = read_str(bytes, offset, room_len);
    offset += room_len;
    let map = read_str(bytes, offset, map_len);
    offset += map_len;
    let players = Array::new();
    for _ in 0..player_count {
        if offset >= bytes.len() { break; }
        let name_len = bytes[offset] as usize;
        offset += 1;
        let username = read_str(bytes, offset, name_len);
        offset += name_len;
        if bytes.len() < offset + 63 { break; }
        let state = decode_player_record_js(bytes, offset);
        offset += 63;
        let player_id = read_u64(bytes, offset - 63);
        let info = Object::new();
        set_f64(&info, "id", player_id as f64);
        set_jsval(&info, "username", &JsValue::from_str(&username));
        set_jsval(&info, "state", &state);
        players.push(&info);
    }
    let obj = Object::new();
    set_str(&obj, "type", "room_state");
    set_jsval(&obj, "room_id", &JsValue::from_str(&room_id));
    set_jsval(&obj, "map", &JsValue::from_str(&map));
    set_jsval(&obj, "players", &players);
    obj.into()
}

fn decode_player_joined_js(bytes: &[u8]) -> JsValue {
    if bytes.len() < 10 { return JsValue::NULL; }
    let player_id = read_u64(bytes, 1);
    let name_len = bytes[9] as usize;
    let username = read_str(bytes, 10, name_len);
    let player = Object::new();
    set_f64(&player, "id", player_id as f64);
    set_jsval(&player, "username", &JsValue::from_str(&username));
    let obj = Object::new();
    set_str(&obj, "type", "player_joined");
    set_jsval(&obj, "player", &player);
    obj.into()
}

fn decode_player_left_js(bytes: &[u8]) -> JsValue {
    if bytes.len() < 9 { return JsValue::NULL; }
    let player_id = read_u64(bytes, 1);
    let obj = Object::new();
    set_str(&obj, "type", "player_left");
    set_f64(&obj, "player_id", player_id as f64);
    obj.into()
}

fn decode_snapshot_js(bytes: &[u8]) -> JsValue {
    if bytes.len() < 14 { return JsValue::NULL; }
    let tick = read_u64(bytes, 1);
    let player_count = bytes[9] as usize;
    let item_count = bytes[10] as usize;
    let projectile_count = read_u16(bytes, 11) as usize;
    let event_count = bytes[13] as usize;
    let mut offset = 14;

    let players = Array::new();
    for _ in 0..player_count {
        if bytes.len() < offset + 63 { return JsValue::NULL; }
        players.push(&decode_player_record_js(bytes, offset));
        offset += 63;
    }

    let items = Array::new();
    for _ in 0..item_count {
        if bytes.len() < offset + 3 { return JsValue::NULL; }
        let flags = bytes[offset];
        let respawn_timer = read_i16(bytes, offset + 1);
        offset += 3;
        let item = Object::new();
        set_bool(&item, "active", (flags & 0x01) != 0);
        set_f64(&item, "respawn_timer", respawn_timer as f64);
        items.push(&item);
    }

    let projectiles = Array::new();
    for _ in 0..projectile_count {
        if bytes.len() < offset + 33 { return JsValue::NULL; }
        let proj = Object::new();
        set_f64(&proj, "id", read_u64(bytes, offset) as f64);
        set_f64(&proj, "x", read_f32(bytes, offset + 8) as f64);
        set_f64(&proj, "y", read_f32(bytes, offset + 12) as f64);
        set_f64(&proj, "velocity_x", read_f32(bytes, offset + 16) as f64);
        set_f64(&proj, "velocity_y", read_f32(bytes, offset + 20) as f64);
        set_f64(&proj, "owner_id", read_i64(bytes, offset + 24) as f64);
        set_str(&proj, "type", kind_u8_to_str(bytes[offset + 32]));
        offset += 33;
        projectiles.push(&proj);
    }

    let events = Array::new();
    for _ in 0..event_count {
        let (event, size) = decode_event_js(bytes, offset);
        if size == 0 { break; }
        offset += size;
        if !event.is_null() { events.push(&event); }
    }

    let obj = Object::new();
    set_str(&obj, "type", "snapshot");
    set_f64(&obj, "tick", tick as f64);
    set_jsval(&obj, "players", &players);
    set_jsval(&obj, "items", &items);
    set_jsval(&obj, "projectiles", &projectiles);
    set_jsval(&obj, "events", &events);
    obj.into()
}

fn decode_player_record_js(bytes: &[u8], offset: usize) -> JsValue {
    let id = read_u64(bytes, offset);
    let x = read_f32(bytes, offset + 8);
    let y = read_f32(bytes, offset + 12);
    let vx = read_f32(bytes, offset + 16);
    let vy = read_f32(bytes, offset + 20);
    let aim_angle = read_f32(bytes, offset + 24);
    let health = read_i16(bytes, offset + 28);
    let armor = read_i16(bytes, offset + 30);
    let current_weapon = bytes[offset + 32];
    let fire_cooldown = bytes[offset + 33];
    let weapon_bits = read_u16(bytes, offset + 34);
    let mut ammo_offset = offset + 36;
    let ammo = Array::new();
    for _ in 0..WEAPON_COUNT {
        ammo.push(&JsValue::from_f64(read_i16(bytes, ammo_offset) as f64));
        ammo_offset += 2;
    }
    let last_input_seq = read_u64(bytes, offset + 54);
    let flags = bytes[offset + 62];
    let weapons = Array::new();
    for i in 0..WEAPON_COUNT {
        weapons.push(&JsValue::from_bool((weapon_bits & (1 << i)) != 0));
    }
    let obj = Object::new();
    set_f64(&obj, "id", id as f64);
    set_f64(&obj, "x", x as f64);
    set_f64(&obj, "y", y as f64);
    set_f64(&obj, "vx", vx as f64);
    set_f64(&obj, "vy", vy as f64);
    set_f64(&obj, "aim_angle", aim_angle as f64);
    set_bool(&obj, "facing_left", (flags & 0x01) != 0);
    set_bool(&obj, "crouch", (flags & 0x02) != 0);
    set_bool(&obj, "dead", (flags & 0x04) != 0);
    set_f64(&obj, "health", health as f64);
    set_f64(&obj, "armor", armor as f64);
    set_f64(&obj, "current_weapon", current_weapon as f64);
    set_f64(&obj, "fire_cooldown", fire_cooldown as f64);
    set_jsval(&obj, "weapons", &weapons);
    set_jsval(&obj, "ammo", &ammo);
    set_f64(&obj, "last_input_seq", last_input_seq as f64);
    set_bool(&obj, "key_left", (flags & 0x08) != 0);
    set_bool(&obj, "key_right", (flags & 0x10) != 0);
    set_bool(&obj, "key_up", (flags & 0x20) != 0);
    set_bool(&obj, "key_down", (flags & 0x40) != 0);
    obj.into()
}

fn decode_event_js(bytes: &[u8], offset: usize) -> (JsValue, usize) {
    if offset >= bytes.len() { return (JsValue::NULL, 0); }
    let event_type = bytes[offset];
    match event_type {
        EVENT_WEAPON_FIRED => {
            if bytes.len() < offset + 10 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "weapon_fired");
            set_f64(&obj, "player_id", read_u64(bytes, offset + 1) as f64);
            set_f64(&obj, "weapon_id", bytes[offset + 9] as f64);
            (obj.into(), 10)
        }
        EVENT_PROJECTILE_SPAWN => {
            if bytes.len() < offset + 34 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "projectile_spawn");
            set_f64(&obj, "id", read_u64(bytes, offset + 1) as f64);
            set_str(&obj, "kind", kind_u8_to_str(bytes[offset + 9]));
            set_f64(&obj, "x", read_f32(bytes, offset + 10) as f64);
            set_f64(&obj, "y", read_f32(bytes, offset + 14) as f64);
            set_f64(&obj, "velocity_x", read_f32(bytes, offset + 18) as f64);
            set_f64(&obj, "velocity_y", read_f32(bytes, offset + 22) as f64);
            set_f64(&obj, "owner_id", read_u64(bytes, offset + 26) as f64);
            (obj.into(), 34)
        }
        EVENT_RAIL => {
            if bytes.len() < offset + 17 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "rail");
            set_f64(&obj, "start_x", read_f32(bytes, offset + 1) as f64);
            set_f64(&obj, "start_y", read_f32(bytes, offset + 5) as f64);
            set_f64(&obj, "end_x", read_f32(bytes, offset + 9) as f64);
            set_f64(&obj, "end_y", read_f32(bytes, offset + 13) as f64);
            (obj.into(), 17)
        }
        EVENT_SHAFT => {
            if bytes.len() < offset + 17 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "shaft");
            set_f64(&obj, "start_x", read_f32(bytes, offset + 1) as f64);
            set_f64(&obj, "start_y", read_f32(bytes, offset + 5) as f64);
            set_f64(&obj, "end_x", read_f32(bytes, offset + 9) as f64);
            set_f64(&obj, "end_y", read_f32(bytes, offset + 13) as f64);
            (obj.into(), 17)
        }
        EVENT_BULLET_IMPACT => {
            if bytes.len() < offset + 13 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "bullet_impact");
            set_f64(&obj, "x", read_f32(bytes, offset + 1) as f64);
            set_f64(&obj, "y", read_f32(bytes, offset + 5) as f64);
            set_f64(&obj, "radius", read_f32(bytes, offset + 9) as f64);
            (obj.into(), 13)
        }
        EVENT_GAUNTLET => {
            if bytes.len() < offset + 9 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "gauntlet");
            set_f64(&obj, "x", read_f32(bytes, offset + 1) as f64);
            set_f64(&obj, "y", read_f32(bytes, offset + 5) as f64);
            (obj.into(), 9)
        }
        EVENT_EXPLOSION => {
            if bytes.len() < offset + 10 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "explosion");
            set_f64(&obj, "x", read_f32(bytes, offset + 1) as f64);
            set_f64(&obj, "y", read_f32(bytes, offset + 5) as f64);
            set_str(&obj, "kind", kind_u8_to_str(bytes[offset + 9]));
            (obj.into(), 10)
        }
        EVENT_DAMAGE => {
            if bytes.len() < offset + 20 { return (JsValue::NULL, 0); }
            let obj = Object::new();
            set_str(&obj, "type", "damage");
            set_f64(&obj, "attacker_id", read_u64(bytes, offset + 1) as f64);
            set_f64(&obj, "target_id", read_u64(bytes, offset + 9) as f64);
            set_f64(&obj, "amount", read_i16(bytes, offset + 17) as f64);
            set_bool(&obj, "killed", (bytes[offset + 19] & 0x01) != 0);
            (obj.into(), 20)
        }
        _ => (JsValue::NULL, 1),
    }
}

fn set_str(obj: &Object, key: &str, val: &str) {
    let _ = Reflect::set(obj, &JsValue::from_str(key), &JsValue::from_str(val));
}

fn set_f64(obj: &Object, key: &str, val: f64) {
    let _ = Reflect::set(obj, &JsValue::from_str(key), &JsValue::from_f64(val));
}

fn set_bool(obj: &Object, key: &str, val: bool) {
    let _ = Reflect::set(obj, &JsValue::from_str(key), &JsValue::from_bool(val));
}

fn set_jsval(obj: &Object, key: &str, val: &JsValue) {
    let _ = Reflect::set(obj, &JsValue::from_str(key), val);
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    let mut raw = [0_u8; 2];
    raw.copy_from_slice(&bytes[offset..offset + 2]);
    u16::from_le_bytes(raw)
}

fn read_i16(bytes: &[u8], offset: usize) -> i16 {
    let mut raw = [0_u8; 2];
    raw.copy_from_slice(&bytes[offset..offset + 2]);
    i16::from_le_bytes(raw)
}

fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    let mut raw = [0_u8; 8];
    raw.copy_from_slice(&bytes[offset..offset + 8]);
    u64::from_le_bytes(raw)
}

fn read_i64(bytes: &[u8], offset: usize) -> i64 {
    let mut raw = [0_u8; 8];
    raw.copy_from_slice(&bytes[offset..offset + 8]);
    i64::from_le_bytes(raw)
}

fn read_f32(bytes: &[u8], offset: usize) -> f32 {
    let mut raw = [0_u8; 4];
    raw.copy_from_slice(&bytes[offset..offset + 4]);
    f32::from_le_bytes(raw)
}

fn read_str(bytes: &[u8], offset: usize, len: usize) -> String {
    String::from_utf8_lossy(&bytes[offset..offset + len]).to_string()
}
