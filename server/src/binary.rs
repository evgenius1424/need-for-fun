use bytes::{BufMut, Bytes, BytesMut};

use crate::constants::SNAPSHOT_BUFFER_RING;
use crate::room::PlayerConn;

pub use binary_protocol::{
    decode_client_message, encode_player_joined, encode_player_left, encode_pong, encode_welcome,
    EffectEvent, ItemSnapshot, PlayerSnapshot, ProjectileSnapshot,
};

use binary_protocol::{write_event, write_player_record, MSG_SNAPSHOT};

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
            write_player_record(buffer, snapshot);
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
            write_event(buffer, event);
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

fn push_u16(buf: &mut BytesMut, v: u16) {
    buf.put_slice(&v.to_le_bytes());
}

fn push_i16(buf: &mut BytesMut, v: i16) {
    buf.put_slice(&v.to_le_bytes());
}

fn push_u64(buf: &mut BytesMut, v: u64) {
    buf.put_slice(&v.to_le_bytes());
}

fn push_i64(buf: &mut BytesMut, v: i64) {
    buf.put_slice(&v.to_le_bytes());
}

fn push_f32(buf: &mut BytesMut, v: f32) {
    buf.put_slice(&v.to_le_bytes());
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
