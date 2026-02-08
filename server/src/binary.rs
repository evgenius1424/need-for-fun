use bytes::{BufMut, Bytes, BytesMut};

use crate::constants::SNAPSHOT_BUFFER_RING;
use crate::room::PlayerConn;

// Re-export from binary_protocol for server use
pub use binary_protocol::{
    decode_client_message, encode_player_joined, encode_player_left, encode_welcome, EffectEvent,
    ItemSnapshot, PlayerSnapshot, ProjectileSnapshot, WEAPON_COUNT,
};

// Import constants for snapshot encoding
use binary_protocol::{
    EVENT_BULLET_IMPACT, EVENT_DAMAGE, EVENT_EXPLOSION, EVENT_GAUNTLET, EVENT_PROJECTILE_SPAWN,
    EVENT_RAIL, EVENT_SHAFT, EVENT_WEAPON_FIRED, MSG_SNAPSHOT,
};

// Server-specific SnapshotEncoder that uses BytesMut for performance
pub struct SnapshotEncoder {
    buffers: Vec<BytesMut>,
    next_buffer: usize,
}

impl SnapshotEncoder {
    pub fn new() -> Self {
        let mut buffers = Vec::with_capacity(SNAPSHOT_BUFFER_RING);
        for _ in 0..SNAPSHOT_BUFFER_RING {
            buffers.push(BytesMut::with_capacity(4096));
        }

        Self {
            buffers,
            next_buffer: 0,
        }
    }

    pub fn encode_snapshot(
        &mut self,
        tick: u64,
        players: &[PlayerSnapshot],
        items: &[ItemSnapshot],
        projectiles: &[ProjectileSnapshot],
        events: &[EffectEvent],
    ) -> Bytes {
        let buffer_idx = self.next_buffer;
        self.next_buffer = (self.next_buffer + 1) % self.buffers.len();

        let buffer = &mut self.buffers[buffer_idx];
        buffer.clear();
        buffer.put_u8(MSG_SNAPSHOT);
        push_u64(buffer, tick);

        let player_count = players.len().min(255) as u8;
        let item_count = items.len().min(255) as u8;
        let projectile_count = projectiles.len().min(u16::MAX as usize) as u16;
        let event_count = events.len().min(255) as u8;

        buffer.put_u8(player_count);
        buffer.put_u8(item_count);
        push_u16(buffer, projectile_count);
        buffer.put_u8(event_count);

        for snapshot in players {
            encode_player_record(buffer, snapshot);
        }

        for item in items {
            let mut flags = 0u8;
            if item.active {
                flags |= 0x01;
            }
            buffer.put_u8(flags);
            push_i16(buffer, item.respawn_timer);
        }

        for proj in projectiles {
            push_u64(buffer, proj.id);
            push_f32(buffer, proj.x);
            push_f32(buffer, proj.y);
            push_f32(buffer, proj.velocity_x);
            push_f32(buffer, proj.velocity_y);
            push_i64(buffer, proj.owner_id);
            buffer.put_u8(proj.kind);
        }

        for event in events {
            encode_event(buffer, event);
        }

        buffer.split().freeze()
    }
}

impl Default for SnapshotEncoder {
    fn default() -> Self {
        Self::new()
    }
}

// Helper function to create a PlayerSnapshot from server state
pub fn player_snapshot_from_state(
    player: &PlayerConn,
    state: &crate::physics::PlayerState,
) -> PlayerSnapshot {
    PlayerSnapshot {
        id: state.id,
        x: state.x,
        y: state.y,
        vx: state.velocity_x,
        vy: state.velocity_y,
        aim_angle: state.aim_angle,
        facing_left: state.facing_left,
        crouch: state.crouch,
        dead: state.dead,
        health: state.health,
        armor: state.armor,
        current_weapon: state.current_weapon,
        fire_cooldown: state.fire_cooldown,
        weapons: state.weapons,
        ammo: state.ammo,
        last_input_seq: player.last_input_seq,
        key_left: state.key_left,
        key_right: state.key_right,
        key_up: state.key_up,
        key_down: state.key_down,
    }
}

// Server-specific encode_room_state that takes PlayerConn and PlayerState
pub fn encode_room_state(
    room_id: &str,
    map_name: &str,
    players: &[PlayerConn],
    player_states: &[crate::physics::PlayerState],
) -> Vec<u8> {
    let players_data: Vec<(String, PlayerSnapshot)> = players
        .iter()
        .zip(player_states.iter())
        .map(|(player, state)| {
            (
                player.username.clone(),
                player_snapshot_from_state(player, state),
            )
        })
        .collect();
    binary_protocol::encode_room_state(room_id, map_name, &players_data)
}

fn encode_player_record(out: &mut impl BufMut, snap: &PlayerSnapshot) {
    push_u64(out, snap.id);
    push_f32(out, snap.x);
    push_f32(out, snap.y);
    push_f32(out, snap.vx);
    push_f32(out, snap.vy);
    push_f32(out, snap.aim_angle);
    push_i16(out, snap.health as i16);
    push_i16(out, snap.armor as i16);
    out.put_u8(snap.current_weapon as u8);
    out.put_u8(snap.fire_cooldown.clamp(0, 255) as u8);

    let mut weapon_bits: u16 = 0;
    for (idx, has) in snap.weapons.iter().enumerate() {
        if *has {
            weapon_bits |= 1 << idx;
        }
    }
    push_u16(out, weapon_bits);

    for idx in 0..WEAPON_COUNT {
        push_i16(
            out,
            snap.ammo[idx].clamp(i16::MIN as i32, i16::MAX as i32) as i16,
        );
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
    out.put_u8(flags);
}

fn encode_event(out: &mut impl BufMut, event: &EffectEvent) {
    match event {
        EffectEvent::WeaponFired {
            player_id,
            weapon_id,
        } => {
            out.put_u8(EVENT_WEAPON_FIRED);
            push_u64(out, *player_id);
            out.put_u8(*weapon_id as u8);
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
            out.put_u8(EVENT_PROJECTILE_SPAWN);
            push_u64(out, *id);
            out.put_u8(*kind);
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
            out.put_u8(EVENT_RAIL);
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
            out.put_u8(EVENT_SHAFT);
            push_f32(out, *start_x);
            push_f32(out, *start_y);
            push_f32(out, *end_x);
            push_f32(out, *end_y);
        }
        EffectEvent::BulletImpact { x, y, radius } => {
            out.put_u8(EVENT_BULLET_IMPACT);
            push_f32(out, *x);
            push_f32(out, *y);
            push_f32(out, *radius);
        }
        EffectEvent::Gauntlet { x, y } => {
            out.put_u8(EVENT_GAUNTLET);
            push_f32(out, *x);
            push_f32(out, *y);
        }
        EffectEvent::Explosion { x, y, kind } => {
            out.put_u8(EVENT_EXPLOSION);
            push_f32(out, *x);
            push_f32(out, *y);
            out.put_u8(*kind);
        }
        EffectEvent::Damage {
            attacker_id,
            target_id,
            amount,
            killed,
        } => {
            out.put_u8(EVENT_DAMAGE);
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
            out.put_u8(flags);
        }
    }
}

fn push_u16(out: &mut impl BufMut, v: u16) {
    out.put_slice(&v.to_le_bytes());
}

fn push_i16(out: &mut impl BufMut, v: i16) {
    out.put_slice(&v.to_le_bytes());
}

fn push_u64(out: &mut impl BufMut, v: u64) {
    out.put_slice(&v.to_le_bytes());
}

fn push_i64(out: &mut impl BufMut, v: i64) {
    out.put_slice(&v.to_le_bytes());
}

fn push_f32(out: &mut impl BufMut, v: f32) {
    out.put_slice(&v.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use binary_protocol::{encode_input, ClientMsg};

    #[test]
    fn input_binary_roundtrip() {
        let bytes = encode_input(42, 1.25, true, false, true, false, true, true, 3, -1);
        let decoded = decode_client_message(&bytes);
        assert!(decoded.is_ok());
        let Ok(decoded) = decoded else {
            return;
        };

        let ClientMsg::Input {
            seq,
            key_up,
            key_down,
            key_left,
            key_right,
            mouse_down,
            weapon_switch,
            weapon_scroll,
            aim_angle,
            facing_left,
        } = decoded
        else {
            panic!("expected Input");
        };

        assert_eq!(seq, 42);
        assert!(key_up);
        assert!(!key_down);
        assert!(key_left);
        assert!(!key_right);
        assert!(mouse_down);
        assert_eq!(weapon_switch, 3);
        assert_eq!(weapon_scroll, -1);
        assert!((aim_angle - 1.25).abs() < f32::EPSILON);
        assert!(facing_left);
    }
}
