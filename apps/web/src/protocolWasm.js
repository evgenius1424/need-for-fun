import { initWasm } from './engine/wasmRuntime/initWasm'
import { getWasmModuleSync } from './engine/wasmRuntime/wasmLoader'

export const MSG = {
    HELLO: 0x01,
    JOIN_ROOM: 0x02,
    INPUT: 0x03,
    PING: 0x04,
    WELCOME: 0x81,
    ROOM_STATE: 0x82,
    PLAYER_JOINED: 0x83,
    PLAYER_LEFT: 0x84,
    SNAPSHOT: 0x85,
    PONG: 0x86,
}

export async function initProtocolWasm() {
    await initWasm()
}

export function getProtocolConstants() {
    return { MSG }
}

function getProtocolModule() {
    return getWasmModuleSync()
}

export function encodeHello(username) {
    return getProtocolModule().wasm_encode_hello(username ?? '')
}

export function encodeJoinRoom(roomId, map) {
    return getProtocolModule().wasm_encode_join_room(roomId ?? '', map ?? '')
}

export function encodeInput(seq, input) {
    return getProtocolModule().wasm_encode_input(
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

export function encodePing(clientTimeMs) {
    return getProtocolModule().wasm_encode_ping(BigInt(clientTimeMs))
}

export function decodeServerMessage(buffer) {
    return getProtocolModule().wasm_decode_server_message(new Uint8Array(buffer))
}
