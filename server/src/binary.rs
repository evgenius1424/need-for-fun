use std::string::FromUtf8Error;

use crate::game::{EventVec, ProjectileKind, WEAPON_COUNT};
use crate::protocol::{ClientMsg, EffectEvent, PlayerSnapshot};
use crate::room::{PlayerConn, Room};

pub const MSG_HELLO: u8 = 0x01;
pub const MSG_JOIN_ROOM: u8 = 0x02;
pub const MSG_INPUT: u8 = 0x03;
pub const MSG_WELCOME: u8 = 0x81;
pub const MSG_ROOM_STATE: u8 = 0x82;
pub const MSG_PLAYER_JOINED: u8 = 0x83;
pub const MSG_PLAYER_LEFT: u8 = 0x84;
pub const MSG_SNAPSHOT: u8 = 0x85;

pub const EVENT_WEAPON_FIRED: u8 = 0x01;
pub const EVENT_PROJECTILE_SPAWN: u8 = 0x02;
pub const EVENT_RAIL: u8 = 0x03;
pub const EVENT_SHAFT: u8 = 0x04;
pub const EVENT_BULLET_IMPACT: u8 = 0x05;
pub const EVENT_GAUNTLET: u8 = 0x06;
pub const EVENT_EXPLOSION: u8 = 0x07;
pub const EVENT_DAMAGE: u8 = 0x08;

pub const PROJ_ROCKET: u8 = 0;
pub const PROJ_GRENADE: u8 = 1;
pub const PROJ_PLASMA: u8 = 2;
pub const PROJ_BFG: u8 = 3;

const MAX_USERNAME_LEN: usize = 32;

#[allow(dead_code)]
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

pub fn decode_client_message(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    let first = *bytes.first().ok_or(DecodeError::Empty)?;
    match first {
        MSG_HELLO => decode_hello(bytes),
        MSG_JOIN_ROOM => decode_join_room(bytes),
        MSG_INPUT => decode_input(bytes),
        _ => Err(DecodeError::UnknownType(first)),
    }
}

pub fn encode_welcome(player_id: u64) -> Vec<u8> {
    let mut out = Vec::with_capacity(9);
    out.push(MSG_WELCOME);
    push_u64(&mut out, player_id);
    out
}

pub fn encode_player_joined(id: u64, username: &str) -> Vec<u8> {
    let name_bytes = username.as_bytes();
    let len = name_bytes.len().min(255);
    let mut out = Vec::with_capacity(10 + len);
    out.push(MSG_PLAYER_JOINED);
    push_u64(&mut out, id);
    out.push(len as u8);
    out.extend_from_slice(&name_bytes[..len]);
    out
}

pub fn encode_player_left(id: u64) -> Vec<u8> {
    let mut out = Vec::with_capacity(9);
    out.push(MSG_PLAYER_LEFT);
    push_u64(&mut out, id);
    out
}

pub fn encode_room_state(room_id: &str, room: &Room) -> Vec<u8> {
    let room_id_bytes = room_id.as_bytes();
    let map_bytes = room.map.name.as_bytes();
    let room_len = room_id_bytes.len().min(255);
    let map_len = map_bytes.len().min(255);
    let player_count = room.players.len().min(255) as u8;

    let mut out = Vec::with_capacity(4 + room_len + map_len + player_count as usize * 80);
    out.push(MSG_ROOM_STATE);
    out.push(room_len as u8);
    out.push(map_len as u8);
    out.push(player_count);
    out.extend_from_slice(&room_id_bytes[..room_len]);
    out.extend_from_slice(&map_bytes[..map_len]);

    for player in room.players.values() {
        encode_player_info(&mut out, player);
    }

    out
}

pub struct SnapshotEncoder {
    buffer: Vec<u8>,
}

#[derive(Clone, Copy, Debug)]
pub struct ItemSnapshot {
    pub active: bool,
    pub respawn_timer: i16,
}

#[derive(Clone, Copy, Debug)]
pub struct ProjectileSnapshot {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub owner_id: i64,
    pub kind: u8,
}

impl SnapshotEncoder {
    pub fn new() -> Self {
        Self {
            buffer: Vec::with_capacity(4096),
        }
    }

    pub fn encode_snapshot(
        &mut self,
        tick: u64,
        players: &[PlayerSnapshot],
        items: &[ItemSnapshot],
        projectiles: &[ProjectileSnapshot],
        events: &EventVec,
    ) -> &[u8] {
        self.buffer.clear();
        self.buffer.push(MSG_SNAPSHOT);
        push_u64(&mut self.buffer, tick);

        let player_count = players.len().min(255) as u8;
        let item_count = items.len().min(255) as u8;
        let projectile_count = projectiles.len().min(u16::MAX as usize) as u16;
        let event_count = events.len().min(255) as u8;

        self.buffer.push(player_count);
        self.buffer.push(item_count);
        push_u16(&mut self.buffer, projectile_count);
        self.buffer.push(event_count);

        for snapshot in players {
            encode_player_record(&mut self.buffer, snapshot);
        }

        for item in items {
            let mut flags = 0u8;
            if item.active {
                flags |= 0x01;
            }
            self.buffer.push(flags);
            push_i16(&mut self.buffer, item.respawn_timer);
        }

        for proj in projectiles {
            push_u64(&mut self.buffer, proj.id);
            push_f32(&mut self.buffer, proj.x);
            push_f32(&mut self.buffer, proj.y);
            push_f32(&mut self.buffer, proj.velocity_x);
            push_f32(&mut self.buffer, proj.velocity_y);
            push_i64(&mut self.buffer, proj.owner_id);
            self.buffer.push(proj.kind);
        }

        for event in events {
            encode_event(&mut self.buffer, event);
        }

        &self.buffer
    }
}

impl Default for SnapshotEncoder {
    fn default() -> Self {
        Self::new()
    }
}

fn decode_hello(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    if bytes.len() < 2 {
        return Err(DecodeError::OutOfBounds);
    }
    let name_len = bytes[1] as usize;
    if name_len > MAX_USERNAME_LEN || bytes.len() < 2 + name_len {
        return Err(DecodeError::OutOfBounds);
    }
    let name = String::from_utf8(bytes[2..2 + name_len].to_vec())?;
    Ok(ClientMsg::Hello { username: name })
}

fn decode_join_room(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    if bytes.len() < 3 {
        return Err(DecodeError::OutOfBounds);
    }
    let room_len = bytes[1] as usize;
    let map_len = bytes[2] as usize;
    let mut offset = 3;
    if bytes.len() < offset + room_len + map_len {
        return Err(DecodeError::OutOfBounds);
    }
    let room_id = if room_len > 0 {
        let room = String::from_utf8(bytes[offset..offset + room_len].to_vec())?;
        offset += room_len;
        Some(room)
    } else {
        None
    };
    let map = if map_len > 0 {
        let name = String::from_utf8(bytes[offset..offset + map_len].to_vec())?;
        Some(name)
    } else {
        None
    };
    Ok(ClientMsg::JoinRoom { room_id, map })
}

fn decode_input(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    if bytes.len() < 16 {
        return Err(DecodeError::OutOfBounds);
    }
    let seq = read_u64(bytes, 1)?;
    let aim_angle = read_f32(bytes, 9)?;
    let flags = bytes[13];
    let weapon_switch = bytes[14] as i8 as i32;
    let weapon_scroll = bytes[15] as i8 as i32;

    Ok(ClientMsg::Input {
        seq,
        key_up: flags & 0x01 != 0,
        key_down: flags & 0x02 != 0,
        key_left: flags & 0x04 != 0,
        key_right: flags & 0x08 != 0,
        mouse_down: flags & 0x10 != 0,
        weapon_switch,
        weapon_scroll,
        aim_angle,
        facing_left: flags & 0x20 != 0,
    })
}

fn encode_player_info(out: &mut Vec<u8>, player: &PlayerConn) {
    let name_bytes = player.username.as_bytes();
    let len = name_bytes.len().min(255);
    out.push(len as u8);
    out.extend_from_slice(&name_bytes[..len]);
    let snapshot = snapshot_for_player(player);
    encode_player_record(out, &snapshot);
}

pub fn snapshot_for_player(player: &PlayerConn) -> PlayerSnapshot {
    PlayerSnapshot {
        id: player.state.id,
        x: player.state.x,
        y: player.state.y,
        vx: player.state.velocity_x,
        vy: player.state.velocity_y,
        aim_angle: player.state.aim_angle,
        facing_left: player.state.facing_left,
        crouch: player.state.crouch,
        dead: player.state.dead,
        health: player.state.health,
        armor: player.state.armor,
        current_weapon: player.state.current_weapon,
        fire_cooldown: player.state.fire_cooldown,
        weapons: player.state.weapons,
        ammo: player.state.ammo,
        last_input_seq: player.last_input_seq,
        key_left: player.state.key_left,
        key_right: player.state.key_right,
        key_up: player.state.key_up,
        key_down: player.state.key_down,
    }
}

fn encode_player_record(out: &mut Vec<u8>, snap: &PlayerSnapshot) {
    push_u64(out, snap.id);
    push_f32(out, snap.x);
    push_f32(out, snap.y);
    push_f32(out, snap.vx);
    push_f32(out, snap.vy);
    push_f32(out, snap.aim_angle);
    push_i16(out, snap.health as i16);
    push_i16(out, snap.armor as i16);
    out.push(snap.current_weapon as u8);
    out.push(snap.fire_cooldown.clamp(0, 255) as u8);

    let mut weapon_bits: u16 = 0;
    for (idx, has) in snap.weapons.iter().enumerate() {
        if *has {
            weapon_bits |= 1 << idx;
        }
    }
    push_u16(out, weapon_bits);

    for idx in 0..WEAPON_COUNT {
        push_i16(out, snap.ammo[idx].clamp(i16::MIN as i32, i16::MAX as i32) as i16);
    }

    push_u64(out, snap.last_input_seq);

    let mut flags = 0u8;
    if snap.facing_left {
        flags |= 0x01;
    }
    if snap.crouch {
        flags |= 0x02;
    }
    if snap.dead {
        flags |= 0x04;
    }
    if snap.key_left {
        flags |= 0x08;
    }
    if snap.key_right {
        flags |= 0x10;
    }
    if snap.key_up {
        flags |= 0x20;
    }
    if snap.key_down {
        flags |= 0x40;
    }
    out.push(flags);
}

fn encode_event(out: &mut Vec<u8>, event: &EffectEvent) {
    match event {
        EffectEvent::WeaponFired {
            player_id,
            weapon_id,
        } => {
            out.push(EVENT_WEAPON_FIRED);
            push_u64(out, *player_id);
            out.push(*weapon_id as u8);
        }
        EffectEvent::ProjectileSpawn {
            id,
            kind,
            x,
            y,
            velocity_x,
            velocity_y,
            owner_id,
        } => {
            out.push(EVENT_PROJECTILE_SPAWN);
            push_u64(out, *id);
            out.push(projectile_kind_id_str(kind));
            push_f32(out, *x);
            push_f32(out, *y);
            push_f32(out, *velocity_x);
            push_f32(out, *velocity_y);
            push_u64(out, *owner_id);
        }
        EffectEvent::Rail {
            start_x,
            start_y,
            end_x,
            end_y,
        } => {
            out.push(EVENT_RAIL);
            push_f32(out, *start_x);
            push_f32(out, *start_y);
            push_f32(out, *end_x);
            push_f32(out, *end_y);
        }
        EffectEvent::Shaft {
            start_x,
            start_y,
            end_x,
            end_y,
        } => {
            out.push(EVENT_SHAFT);
            push_f32(out, *start_x);
            push_f32(out, *start_y);
            push_f32(out, *end_x);
            push_f32(out, *end_y);
        }
        EffectEvent::BulletImpact { x, y, radius } => {
            out.push(EVENT_BULLET_IMPACT);
            push_f32(out, *x);
            push_f32(out, *y);
            push_f32(out, *radius);
        }
        EffectEvent::Gauntlet { x, y } => {
            out.push(EVENT_GAUNTLET);
            push_f32(out, *x);
            push_f32(out, *y);
        }
        EffectEvent::Explosion { x, y, kind } => {
            out.push(EVENT_EXPLOSION);
            push_f32(out, *x);
            push_f32(out, *y);
            out.push(projectile_kind_id_str(kind));
        }
        EffectEvent::Damage {
            attacker_id,
            target_id,
            amount,
            killed,
        } => {
            out.push(EVENT_DAMAGE);
            push_u64(out, *attacker_id);
            push_u64(out, *target_id);
            push_i16(
                out,
                (*amount).clamp(i16::MIN as i32, i16::MAX as i32) as i16,
            );
            let mut flags = 0u8;
            if *killed {
                flags |= 0x01;
            }
            out.push(flags);
        }
    }
}

#[allow(dead_code)]
fn projectile_kind_id(kind: ProjectileKind) -> u8 {
    match kind {
        ProjectileKind::Rocket => PROJ_ROCKET,
        ProjectileKind::Grenade => PROJ_GRENADE,
        ProjectileKind::Plasma => PROJ_PLASMA,
        ProjectileKind::Bfg => PROJ_BFG,
    }
}

fn projectile_kind_id_str(kind: &str) -> u8 {
    match kind {
        "rocket" => PROJ_ROCKET,
        "grenade" => PROJ_GRENADE,
        "plasma" => PROJ_PLASMA,
        "bfg" => PROJ_BFG,
        _ => PROJ_ROCKET,
    }
}

fn push_u16(out: &mut Vec<u8>, v: u16) {
    out.extend_from_slice(&v.to_le_bytes());
}

fn push_i16(out: &mut Vec<u8>, v: i16) {
    out.extend_from_slice(&v.to_le_bytes());
}

fn push_u64(out: &mut Vec<u8>, v: u64) {
    out.extend_from_slice(&v.to_le_bytes());
}

fn push_i64(out: &mut Vec<u8>, v: i64) {
    out.extend_from_slice(&v.to_le_bytes());
}

fn push_f32(out: &mut Vec<u8>, v: f32) {
    out.extend_from_slice(&v.to_le_bytes());
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, DecodeError> {
    if bytes.len() < offset + 8 {
        return Err(DecodeError::OutOfBounds);
    }
    Ok(u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap()))
}

fn read_f32(bytes: &[u8], offset: usize) -> Result<f32, DecodeError> {
    if bytes.len() < offset + 4 {
        return Err(DecodeError::OutOfBounds);
    }
    Ok(f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()))
}
