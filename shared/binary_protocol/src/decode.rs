use crate::constants::*;
use crate::types::{ClientMsg, DecodeError};

pub fn decode_client_message(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    let first = *bytes.first().ok_or(DecodeError::Empty)?;
    match first {
        MSG_HELLO => decode_hello(bytes),
        MSG_JOIN_ROOM => decode_join_room(bytes),
        MSG_INPUT => decode_input(bytes),
        MSG_PING => decode_ping(bytes),
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

fn decode_ping(bytes: &[u8]) -> Result<ClientMsg, DecodeError> {
    if bytes.len() < 9 {
        return Err(DecodeError::OutOfBounds);
    }
    Ok(ClientMsg::Ping {
        client_time_ms: read_u64(bytes, 1)?,
    })
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, DecodeError> {
    if bytes.len() < offset + 8 {
        return Err(DecodeError::OutOfBounds);
    }
    let mut raw = [0_u8; 8];
    raw.copy_from_slice(&bytes[offset..offset + 8]);
    Ok(u64::from_le_bytes(raw))
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
