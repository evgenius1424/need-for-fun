use crate::constants::*;
use crate::types::{EffectEvent, ItemSnapshot, PlayerSnapshot, ProjectileSnapshot};

pub trait BinaryWriter {
    fn put_u8(&mut self, v: u8);
    fn put_slice(&mut self, slice: &[u8]);
}

impl BinaryWriter for Vec<u8> {
    fn put_u8(&mut self, v: u8) {
        self.push(v);
    }
    fn put_slice(&mut self, slice: &[u8]) {
        self.extend_from_slice(slice);
    }
}

#[cfg(feature = "server")]
impl BinaryWriter for bytes::BytesMut {
    fn put_u8(&mut self, v: u8) {
        bytes::BufMut::put_u8(self, v);
    }
    fn put_slice(&mut self, slice: &[u8]) {
        bytes::BufMut::put_slice(self, slice);
    }
}

pub fn encode_hello(username: &str) -> Vec<u8> {
    let name_bytes = username.as_bytes();
    let len = name_bytes.len().min(MAX_USERNAME_LEN);
    let mut out = Vec::with_capacity(2 + len);
    out.push(MSG_HELLO);
    out.push(len as u8);
    out.extend_from_slice(&name_bytes[..len]);
    out
}

pub fn encode_join_room(room_id: &str, map: &str) -> Vec<u8> {
    let room_bytes = room_id.as_bytes();
    let map_bytes = map.as_bytes();
    let room_len = room_bytes.len().min(255);
    let map_len = map_bytes.len().min(255);
    let mut out = Vec::with_capacity(3 + room_len + map_len);
    out.push(MSG_JOIN_ROOM);
    out.push(room_len as u8);
    out.push(map_len as u8);
    out.extend_from_slice(&room_bytes[..room_len]);
    out.extend_from_slice(&map_bytes[..map_len]);
    out
}

pub fn encode_input(
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
    let mut out = Vec::with_capacity(16);
    out.push(MSG_INPUT);
    push_u64(&mut out, seq);
    push_f32(&mut out, aim_angle);
    let mut flags = 0u8;
    if key_up { flags |= 0x01; }
    if key_down { flags |= 0x02; }
    if key_left { flags |= 0x04; }
    if key_right { flags |= 0x08; }
    if mouse_down { flags |= 0x10; }
    if facing_left { flags |= 0x20; }
    out.push(flags);
    out.push(weapon_switch as u8);
    out.push(weapon_scroll as u8);
    out
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

pub fn encode_room_state(
    room_id: &str,
    map_name: &str,
    players: &[(String, PlayerSnapshot)],
) -> Vec<u8> {
    let room_id_bytes = room_id.as_bytes();
    let map_bytes = map_name.as_bytes();
    let room_len = room_id_bytes.len().min(255);
    let map_len = map_bytes.len().min(255);
    let player_count = players.len().min(255) as u8;
    let mut out = Vec::with_capacity(4 + room_len + map_len + player_count as usize * 96);
    out.push(MSG_ROOM_STATE);
    out.push(room_len as u8);
    out.push(map_len as u8);
    out.push(player_count);
    out.extend_from_slice(&room_id_bytes[..room_len]);
    out.extend_from_slice(&map_bytes[..map_len]);
    for (username, snapshot) in players {
        let name_bytes = username.as_bytes();
        let len = name_bytes.len().min(255);
        out.push(len as u8);
        out.extend_from_slice(&name_bytes[..len]);
        write_player_record(&mut out, snapshot);
    }
    out
}

pub fn encode_snapshot(
    tick: u64,
    players: &[PlayerSnapshot],
    items: &[ItemSnapshot],
    projectiles: &[ProjectileSnapshot],
    events: &[EffectEvent],
) -> Vec<u8> {
    let player_count = players.len().min(255) as u8;
    let item_count = items.len().min(255) as u8;
    let projectile_count = projectiles.len().min(u16::MAX as usize) as u16;
    let event_count = events.len().min(255) as u8;
    let mut out = Vec::with_capacity(
        14 + (player_count as usize * 63)
            + (item_count as usize * 3)
            + (projectile_count as usize * 33)
            + (event_count as usize * 40),
    );
    out.push(MSG_SNAPSHOT);
    push_u64(&mut out, tick);
    out.push(player_count);
    out.push(item_count);
    push_u16(&mut out, projectile_count);
    out.push(event_count);
    for snapshot in players {
        write_player_record(&mut out, snapshot);
    }
    for item in items {
        let mut flags = 0u8;
        if item.active { flags |= 0x01; }
        out.push(flags);
        push_i16(&mut out, item.respawn_timer);
    }
    for proj in projectiles {
        push_u64(&mut out, proj.id);
        push_f32(&mut out, proj.x);
        push_f32(&mut out, proj.y);
        push_f32(&mut out, proj.velocity_x);
        push_f32(&mut out, proj.velocity_y);
        push_i64(&mut out, proj.owner_id);
        out.push(proj.kind);
    }
    for event in events {
        write_event(&mut out, event);
    }
    out
}

pub fn write_player_record<W: BinaryWriter>(out: &mut W, snap: &PlayerSnapshot) {
    write_u64(out, snap.id);
    write_f32(out, snap.x);
    write_f32(out, snap.y);
    write_f32(out, snap.vx);
    write_f32(out, snap.vy);
    write_f32(out, snap.aim_angle);
    write_i16(out, snap.health as i16);
    write_i16(out, snap.armor as i16);
    out.put_u8(snap.current_weapon as u8);
    out.put_u8(snap.fire_cooldown.clamp(0, 255) as u8);
    let mut weapon_bits: u16 = 0;
    for (idx, has) in snap.weapons.iter().enumerate() {
        if *has { weapon_bits |= 1 << idx; }
    }
    write_u16(out, weapon_bits);
    for idx in 0..WEAPON_COUNT {
        write_i16(out, snap.ammo[idx].clamp(i16::MIN as i32, i16::MAX as i32) as i16);
    }
    write_u64(out, snap.last_input_seq);
    let mut flags = 0u8;
    if snap.facing_left { flags |= 0x01; }
    if snap.crouch { flags |= 0x02; }
    if snap.dead { flags |= 0x04; }
    if snap.key_left { flags |= 0x08; }
    if snap.key_right { flags |= 0x10; }
    if snap.key_up { flags |= 0x20; }
    if snap.key_down { flags |= 0x40; }
    out.put_u8(flags);
}

pub fn write_event<W: BinaryWriter>(out: &mut W, event: &EffectEvent) {
    match event {
        EffectEvent::WeaponFired { player_id, weapon_id } => {
            out.put_u8(EVENT_WEAPON_FIRED);
            write_u64(out, *player_id);
            out.put_u8(*weapon_id as u8);
        }
        EffectEvent::ProjectileSpawn { id, kind, x, y, velocity_x, velocity_y, owner_id } => {
            out.put_u8(EVENT_PROJECTILE_SPAWN);
            write_u64(out, *id);
            out.put_u8(*kind);
            write_f32(out, *x);
            write_f32(out, *y);
            write_f32(out, *velocity_x);
            write_f32(out, *velocity_y);
            write_u64(out, *owner_id);
        }
        EffectEvent::Rail { start_x, start_y, end_x, end_y } => {
            out.put_u8(EVENT_RAIL);
            write_f32(out, *start_x);
            write_f32(out, *start_y);
            write_f32(out, *end_x);
            write_f32(out, *end_y);
        }
        EffectEvent::Shaft { start_x, start_y, end_x, end_y } => {
            out.put_u8(EVENT_SHAFT);
            write_f32(out, *start_x);
            write_f32(out, *start_y);
            write_f32(out, *end_x);
            write_f32(out, *end_y);
        }
        EffectEvent::BulletImpact { x, y, radius } => {
            out.put_u8(EVENT_BULLET_IMPACT);
            write_f32(out, *x);
            write_f32(out, *y);
            write_f32(out, *radius);
        }
        EffectEvent::Gauntlet { x, y } => {
            out.put_u8(EVENT_GAUNTLET);
            write_f32(out, *x);
            write_f32(out, *y);
        }
        EffectEvent::Explosion { x, y, kind } => {
            out.put_u8(EVENT_EXPLOSION);
            write_f32(out, *x);
            write_f32(out, *y);
            out.put_u8(*kind);
        }
        EffectEvent::Damage { attacker_id, target_id, amount, killed } => {
            out.put_u8(EVENT_DAMAGE);
            write_u64(out, *attacker_id);
            write_u64(out, *target_id);
            write_i16(out, (*amount).clamp(i16::MIN as i32, i16::MAX as i32) as i16);
            out.put_u8(if *killed { 0x01 } else { 0x00 });
        }
    }
}

pub fn kind_u8_to_str(kind: u8) -> &'static str {
    match kind {
        PROJ_ROCKET => "rocket",
        PROJ_GRENADE => "grenade",
        PROJ_PLASMA => "plasma",
        PROJ_BFG => "bfg",
        _ => "rocket",
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

fn write_u16<W: BinaryWriter>(out: &mut W, v: u16) {
    out.put_slice(&v.to_le_bytes());
}

fn write_i16<W: BinaryWriter>(out: &mut W, v: i16) {
    out.put_slice(&v.to_le_bytes());
}

fn write_u64<W: BinaryWriter>(out: &mut W, v: u64) {
    out.put_slice(&v.to_le_bytes());
}

fn write_f32<W: BinaryWriter>(out: &mut W, v: f32) {
    out.put_slice(&v.to_le_bytes());
}
