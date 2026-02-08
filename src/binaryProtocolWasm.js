let wasmModule = null

export const MSG = {
    HELLO: 0x01,
    JOIN_ROOM: 0x02,
    INPUT: 0x03,
    WELCOME: 0x10,
    PLAYER_JOINED: 0x11,
    PLAYER_LEFT: 0x12,
    ROOM_STATE: 0x20,
    SNAPSHOT: 0x21,
}

export async function initBinaryProtocol() {
    if (wasmModule) return
    wasmModule = await import('./engine/wasm/physics_core.js')
    await wasmModule.default()
}

export function getProtocolConstants() {
    return { MSG }
}

export function encodeHello(username) {
    if (!wasmModule) {
        throw new Error('Binary protocol not initialized. Call initBinaryProtocol() first.')
    }
    return wasmModule.wasm_encode_hello(username ?? '')
}

export function encodeJoinRoom(roomId, map) {
    if (!wasmModule) {
        throw new Error('Binary protocol not initialized. Call initBinaryProtocol() first.')
    }
    return wasmModule.wasm_encode_join_room(roomId ?? '', map ?? '')
}

export function encodeInput(seq, input) {
    if (!wasmModule) {
        throw new Error('Binary protocol not initialized. Call initBinaryProtocol() first.')
    }
    return wasmModule.wasm_encode_input(
        BigInt(seq),
        input.aim_angle ?? 0,
        input.key_up ?? false,
        input.key_down ?? false,
        input.key_left ?? false,
        input.key_right ?? false,
        input.mouse_down ?? false,
        input.facing_left ?? false,
        input.weapon_switch ?? -1,
        input.weapon_scroll ?? 0,
    )
}

export function decodeServerMessage(buffer) {
    if (!wasmModule) {
        throw new Error('Binary protocol not initialized. Call initBinaryProtocol() first.')
    }
    return wasmModule.wasm_decode_server_message(new Uint8Array(buffer))
}
