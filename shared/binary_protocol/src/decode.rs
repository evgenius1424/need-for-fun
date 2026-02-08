use crate::constants::*;
use crate::encode::kind_u8_to_str;
use crate::types::{
    ClientMsg, DecodeError, EffectEventJs, ItemState, PlayerInfo, PlayerSnapshot,
    ProjectileStateJs, ServerMsg,
};

// Helper functions for decoding
fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, DecodeError> {
    if bytes.len() < offset + 2 {
        return Err(DecodeError::OutOfBounds);
    }
    let mut raw = [0_u8; 2];
    raw.copy_from_slice(&bytes[offset..offset + 2]);
    Ok(u16::from_le_bytes(raw))
}

fn read_i16(bytes: &[u8], offset: usize) -> Result<i16, DecodeError> {
    if bytes.len() < offset + 2 {
        return Err(DecodeError::OutOfBounds);
    }
    let mut raw = [0_u8; 2];
    raw.copy_from_slice(&bytes[offset..offset + 2]);
    Ok(i16::from_le_bytes(raw))
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, DecodeError> {
    if bytes.len() < offset + 8 {
        return Err(DecodeError::OutOfBounds);
    }
    let mut raw = [0_u8; 8];
    raw.copy_from_slice(&bytes[offset..offset + 8]);
    Ok(u64::from_le_bytes(raw))
}

fn read_i64(bytes: &[u8], offset: usize) -> Result<i64, DecodeError> {
    if bytes.len() < offset + 8 {
        return Err(DecodeError::OutOfBounds);
    }
    let mut raw = [0_u8; 8];
    raw.copy_from_slice(&bytes[offset..offset + 8]);
    Ok(i64::from_le_bytes(raw))
}

fn read_f32(bytes: &[u8], offset: usize) -> Result<f32, DecodeError> {
    if bytes.len() < offset + 4 {
        return Err(DecodeError::OutOfBounds);
    }
    let mut raw = [0_u8; 4];
    raw.copy_from_slice(&bytes[offset..offset + 4]);
    Ok(f32::from_le_bytes(raw))
}

fn read_string(bytes: &[u8], offset: usize, len: usize) -> Result<String, DecodeError> {
    if bytes.len() < offset + len {
        return Err(DecodeError::OutOfBounds);
    }
    String::from_utf8(bytes[offset..offset + len].to_vec()).map_err(|_| DecodeError::InvalidUtf8)
}

// Client message decoding (server-side)

pub fn decode_client_message(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    let first = *bytes.first().ok_or(DecodeError::Empty)?;
    match first {
        MSG_HELLO => decode_hello(bytes),
        MSG_JOIN_ROOM => decode_join_room(bytes),
        MSG_INPUT => decode_input(bytes),
        _ => Err(DecodeError::UnknownType(first)),
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
    let username = read_string(bytes, 2, name_len)?;
    Ok(ClientMsg::Hello { username })
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
        let room = read_string(bytes, offset, room_len)?;
        offset += room_len;
        Some(room)
    } else {
        None
    };

    let map = if map_len > 0 {
        Some(read_string(bytes, offset, map_len)?)
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

// Server message decoding (client-side, used via WASM)

pub fn decode_server_message(bytes: &[u8]) -> Result<ServerMsg, DecodeError> {
    let first = *bytes.first().ok_or(DecodeError::Empty)?;
    match first {
        MSG_WELCOME => decode_welcome(bytes),
        MSG_ROOM_STATE => decode_room_state(bytes),
        MSG_PLAYER_JOINED => decode_player_joined(bytes),
        MSG_PLAYER_LEFT => decode_player_left(bytes),
        MSG_SNAPSHOT => decode_snapshot(bytes),
        _ => Err(DecodeError::UnknownType(first)),
    }
}

fn decode_welcome(bytes: &[u8]) -> Result<ServerMsg, DecodeError> {
    if bytes.len() < 9 {
        return Err(DecodeError::OutOfBounds);
    }
    let player_id = read_u64(bytes, 1)?;
    Ok(ServerMsg::Welcome { player_id })
}

fn decode_room_state(bytes: &[u8]) -> Result<ServerMsg, DecodeError> {
    if bytes.len() < 4 {
        return Err(DecodeError::OutOfBounds);
    }

    let room_len = bytes[1] as usize;
    let map_len = bytes[2] as usize;
    let player_count = bytes[3] as usize;
    let mut offset = 4;

    let room_id = read_string(bytes, offset, room_len)?;
    offset += room_len;
    let map = read_string(bytes, offset, map_len)?;
    offset += map_len;

    let mut players = Vec::with_capacity(player_count);
    for _ in 0..player_count {
        if offset >= bytes.len() {
            return Err(DecodeError::OutOfBounds);
        }
        let name_len = bytes[offset] as usize;
        offset += 1;
        let username = read_string(bytes, offset, name_len)?;
        offset += name_len;
        let (snapshot, bytes_read) = decode_player_record(bytes, offset)?;
        offset += bytes_read;
        players.push(PlayerInfo {
            id: snapshot.id,
            username,
            model: None,
            skin: None,
            state: Some(snapshot),
        });
    }

    Ok(ServerMsg::RoomState {
        room_id,
        map,
        players,
    })
}

fn decode_player_joined(bytes: &[u8]) -> Result<ServerMsg, DecodeError> {
    if bytes.len() < 10 {
        return Err(DecodeError::OutOfBounds);
    }
    let player_id = read_u64(bytes, 1)?;
    let name_len = bytes[9] as usize;
    let username = read_string(bytes, 10, name_len)?;
    Ok(ServerMsg::PlayerJoined {
        player: PlayerInfo {
            id: player_id,
            username,
            model: None,
            skin: None,
            state: None,
        },
    })
}

fn decode_player_left(bytes: &[u8]) -> Result<ServerMsg, DecodeError> {
    if bytes.len() < 9 {
        return Err(DecodeError::OutOfBounds);
    }
    let player_id = read_u64(bytes, 1)?;
    Ok(ServerMsg::PlayerLeft { player_id })
}

fn decode_snapshot(bytes: &[u8]) -> Result<ServerMsg, DecodeError> {
    if bytes.len() < 14 {
        return Err(DecodeError::OutOfBounds);
    }

    let tick = read_u64(bytes, 1)?;
    let player_count = bytes[9] as usize;
    let item_count = bytes[10] as usize;
    let projectile_count = read_u16(bytes, 11)? as usize;
    let event_count = bytes[13] as usize;
    let mut offset = 14;

    let mut players = Vec::with_capacity(player_count);
    for _ in 0..player_count {
        let (snapshot, bytes_read) = decode_player_record(bytes, offset)?;
        offset += bytes_read;
        players.push(snapshot);
    }

    let mut items = Vec::with_capacity(item_count);
    for _ in 0..item_count {
        if bytes.len() < offset + 3 {
            return Err(DecodeError::OutOfBounds);
        }
        let flags = bytes[offset];
        let respawn_timer = read_i16(bytes, offset + 1)?;
        offset += 3;
        items.push(ItemState {
            active: (flags & 0x01) != 0,
            respawn_timer,
        });
    }

    let mut projectiles = Vec::with_capacity(projectile_count);
    for _ in 0..projectile_count {
        if bytes.len() < offset + 33 {
            return Err(DecodeError::OutOfBounds);
        }
        let id = read_u64(bytes, offset)?;
        let x = read_f32(bytes, offset + 8)?;
        let y = read_f32(bytes, offset + 12)?;
        let velocity_x = read_f32(bytes, offset + 16)?;
        let velocity_y = read_f32(bytes, offset + 20)?;
        let owner_id = read_i64(bytes, offset + 24)?;
        let kind = bytes[offset + 32];
        offset += 33;
        projectiles.push(ProjectileStateJs {
            id,
            x,
            y,
            velocity_x,
            velocity_y,
            owner_id,
            kind: kind_u8_to_str(kind).to_string(),
        });
    }

    let mut events = Vec::with_capacity(event_count);
    for _ in 0..event_count {
        let (event, bytes_read) = decode_event(bytes, offset)?;
        offset += bytes_read;
        if let Some(e) = event {
            events.push(e);
        }
    }

    Ok(ServerMsg::Snapshot {
        tick,
        players,
        items,
        projectiles,
        events,
    })
}

fn decode_player_record(bytes: &[u8], offset: usize) -> Result<(PlayerSnapshot, usize), DecodeError> {
    if bytes.len() < offset + 63 {
        return Err(DecodeError::OutOfBounds);
    }

    let id = read_u64(bytes, offset)?;
    let x = read_f32(bytes, offset + 8)?;
    let y = read_f32(bytes, offset + 12)?;
    let vx = read_f32(bytes, offset + 16)?;
    let vy = read_f32(bytes, offset + 20)?;
    let aim_angle = read_f32(bytes, offset + 24)?;
    let health = read_i16(bytes, offset + 28)? as i32;
    let armor = read_i16(bytes, offset + 30)? as i32;
    let current_weapon = bytes[offset + 32] as i32;
    let fire_cooldown = bytes[offset + 33] as i32;
    let weapon_bits = read_u16(bytes, offset + 34)?;

    let mut ammo = [0i32; WEAPON_COUNT];
    let mut ammo_offset = offset + 36;
    for slot in ammo.iter_mut() {
        *slot = read_i16(bytes, ammo_offset)? as i32;
        ammo_offset += 2;
    }

    let last_input_seq = read_u64(bytes, offset + 54)?;
    let flags = bytes[offset + 62];

    let mut weapons = [false; WEAPON_COUNT];
    for (i, weapon) in weapons.iter_mut().enumerate() {
        *weapon = (weapon_bits & (1 << i)) != 0;
    }

    let snapshot = PlayerSnapshot {
        id,
        x,
        y,
        vx,
        vy,
        aim_angle,
        facing_left: (flags & 0x01) != 0,
        crouch: (flags & 0x02) != 0,
        dead: (flags & 0x04) != 0,
        health,
        armor,
        current_weapon,
        fire_cooldown,
        weapons,
        ammo,
        last_input_seq,
        key_left: (flags & 0x08) != 0,
        key_right: (flags & 0x10) != 0,
        key_up: (flags & 0x20) != 0,
        key_down: (flags & 0x40) != 0,
    };

    Ok((snapshot, 63))
}

fn decode_event(
    bytes: &[u8],
    offset: usize,
) -> Result<(Option<EffectEventJs>, usize), DecodeError> {
    if offset >= bytes.len() {
        return Err(DecodeError::OutOfBounds);
    }

    let event_type = bytes[offset];
    match event_type {
        EVENT_WEAPON_FIRED => {
            if bytes.len() < offset + 10 {
                return Err(DecodeError::OutOfBounds);
            }
            let player_id = read_u64(bytes, offset + 1)?;
            let weapon_id = bytes[offset + 9] as i32;
            Ok((
                Some(EffectEventJs::WeaponFired {
                    player_id,
                    weapon_id,
                }),
                10,
            ))
        }
        EVENT_PROJECTILE_SPAWN => {
            if bytes.len() < offset + 34 {
                return Err(DecodeError::OutOfBounds);
            }
            let id = read_u64(bytes, offset + 1)?;
            let kind = bytes[offset + 9];
            let x = read_f32(bytes, offset + 10)?;
            let y = read_f32(bytes, offset + 14)?;
            let velocity_x = read_f32(bytes, offset + 18)?;
            let velocity_y = read_f32(bytes, offset + 22)?;
            let owner_id = read_u64(bytes, offset + 26)?;
            Ok((
                Some(EffectEventJs::ProjectileSpawn {
                    id,
                    kind: kind_u8_to_str(kind).to_string(),
                    x,
                    y,
                    velocity_x,
                    velocity_y,
                    owner_id,
                }),
                34,
            ))
        }
        EVENT_RAIL => {
            if bytes.len() < offset + 17 {
                return Err(DecodeError::OutOfBounds);
            }
            let start_x = read_f32(bytes, offset + 1)?;
            let start_y = read_f32(bytes, offset + 5)?;
            let end_x = read_f32(bytes, offset + 9)?;
            let end_y = read_f32(bytes, offset + 13)?;
            Ok((
                Some(EffectEventJs::Rail {
                    start_x,
                    start_y,
                    end_x,
                    end_y,
                }),
                17,
            ))
        }
        EVENT_SHAFT => {
            if bytes.len() < offset + 17 {
                return Err(DecodeError::OutOfBounds);
            }
            let start_x = read_f32(bytes, offset + 1)?;
            let start_y = read_f32(bytes, offset + 5)?;
            let end_x = read_f32(bytes, offset + 9)?;
            let end_y = read_f32(bytes, offset + 13)?;
            Ok((
                Some(EffectEventJs::Shaft {
                    start_x,
                    start_y,
                    end_x,
                    end_y,
                }),
                17,
            ))
        }
        EVENT_BULLET_IMPACT => {
            if bytes.len() < offset + 13 {
                return Err(DecodeError::OutOfBounds);
            }
            let x = read_f32(bytes, offset + 1)?;
            let y = read_f32(bytes, offset + 5)?;
            let radius = read_f32(bytes, offset + 9)?;
            Ok((Some(EffectEventJs::BulletImpact { x, y, radius }), 13))
        }
        EVENT_GAUNTLET => {
            if bytes.len() < offset + 9 {
                return Err(DecodeError::OutOfBounds);
            }
            let x = read_f32(bytes, offset + 1)?;
            let y = read_f32(bytes, offset + 5)?;
            Ok((Some(EffectEventJs::Gauntlet { x, y }), 9))
        }
        EVENT_EXPLOSION => {
            if bytes.len() < offset + 10 {
                return Err(DecodeError::OutOfBounds);
            }
            let x = read_f32(bytes, offset + 1)?;
            let y = read_f32(bytes, offset + 5)?;
            let kind = bytes[offset + 9];
            Ok((
                Some(EffectEventJs::Explosion {
                    x,
                    y,
                    kind: kind_u8_to_str(kind).to_string(),
                }),
                10,
            ))
        }
        EVENT_DAMAGE => {
            if bytes.len() < offset + 20 {
                return Err(DecodeError::OutOfBounds);
            }
            let attacker_id = read_u64(bytes, offset + 1)?;
            let target_id = read_u64(bytes, offset + 9)?;
            let amount = read_i16(bytes, offset + 17)? as i32;
            let flags = bytes[offset + 19];
            Ok((
                Some(EffectEventJs::Damage {
                    attacker_id,
                    target_id,
                    amount,
                    killed: (flags & 0x01) != 0,
                }),
                20,
            ))
        }
        _ => Ok((None, 1)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encode::{encode_hello, encode_input, encode_join_room};

    #[test]
    fn hello_roundtrip() {
        let encoded = encode_hello("TestUser");
        let decoded = decode_client_message(&encoded).unwrap();
        match decoded {
            ClientMsg::Hello { username } => assert_eq!(username, "TestUser"),
            _ => panic!("expected Hello"),
        }
    }

    #[test]
    fn join_room_roundtrip() {
        let encoded = encode_join_room("room-1", "dm2");
        let decoded = decode_client_message(&encoded).unwrap();
        match decoded {
            ClientMsg::JoinRoom { room_id, map } => {
                assert_eq!(room_id, Some("room-1".to_string()));
                assert_eq!(map, Some("dm2".to_string()));
            }
            _ => panic!("expected JoinRoom"),
        }
    }

    #[test]
    fn input_roundtrip() {
        let encoded = encode_input(42, 1.25, true, false, true, false, true, true, 3, -1);
        let decoded = decode_client_message(&encoded).unwrap();
        match decoded {
            ClientMsg::Input {
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
            } => {
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
            _ => panic!("expected Input"),
        }
    }
}
