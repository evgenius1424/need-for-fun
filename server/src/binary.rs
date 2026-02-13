use bytes::{BufMut, Bytes, BytesMut};

use crate::constants::SNAPSHOT_BUFFER_RING;
use crate::room::PlayerConn;

pub use binary_protocol::{
    decode_client_message, encode_player_joined, encode_player_left, encode_pong, encode_welcome,
    ClientMsg, EffectEvent, ItemSnapshot, PlayerSnapshot, ProjectileSnapshot,
};

use binary_protocol::{write_event, write_player_record, MSG_SNAPSHOT};

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
        server_time_ms: u64,
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
        buffer.put_u64_le(tick);
        buffer.put_u64_le(server_time_ms);

        let player_count = players.len().min(255) as u8;
        let item_count = items.len().min(255) as u8;
        let projectile_count = projectiles.len().min(u16::MAX as usize) as u16;
        let event_count = events.len().min(255) as u8;

        buffer.put_u8(player_count);
        buffer.put_u8(item_count);
        buffer.put_u16_le(projectile_count);
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
            buffer.put_i16_le(item.respawn_timer);
        }

        for proj in projectiles {
            buffer.put_u64_le(proj.id);
            buffer.put_f32_le(proj.x);
            buffer.put_f32_le(proj.y);
            buffer.put_f32_le(proj.velocity_x);
            buffer.put_f32_le(proj.velocity_y);
            buffer.put_i64_le(proj.owner_id);
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

pub fn player_snapshot_from_state(
    last_input_seq: u64,
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
        last_input_seq,
        key_left: state.key_left,
        key_right: state.key_right,
        key_up: state.key_up,
        key_down: state.key_down,
    }
}

pub fn encode_room_state(
    room_id: &str,
    map_name: &str,
    players: &[PlayerConn],
    player_states: &[crate::physics::PlayerState],
) -> Vec<u8> {
    assert_eq!(
        players.len(),
        player_states.len(),
        "players/player_states length mismatch"
    );

    let players_data: Vec<(String, PlayerSnapshot)> = players
        .iter()
        .enumerate()
        .map(|(idx, player)| {
            let state = &player_states[idx];
            (
                player.username.clone(),
                player_snapshot_from_state(player.last_input_seq, state),
            )
        })
        .collect();
    binary_protocol::encode_room_state(room_id, map_name, &players_data)
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
