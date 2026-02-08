// WASM-based binary protocol wrapper
// Uses the shared binary_protocol crate compiled to WASM via physics_core

let wasmModule = null
let MSG = null

// Pre-allocated buffer for input encoding (matches original JS implementation)
const inputBuffer = new ArrayBuffer(16)

export async function initBinaryProtocol() {
    if (wasmModule) return

    wasmModule = await import('./engine/wasm/physics_core.js')
    await wasmModule.default()

    // Load protocol constants from WASM
    const constants = wasmModule.get_protocol_constants()
    MSG = constants.msg
}

export function getProtocolConstants() {
    return { MSG }
}

export { MSG }

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

    // Use WASM encoding
    const result = wasmModule.wasm_encode_input(
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

    // Copy WASM result to our pre-allocated buffer for consistency with original API
    const view = new Uint8Array(inputBuffer)
    view.set(result)
    return inputBuffer
}

export function decodeServerMessage(buffer) {
    if (!wasmModule) {
        throw new Error('Binary protocol not initialized. Call initBinaryProtocol() first.')
    }
    return wasmModule.wasm_decode_server_message(new Uint8Array(buffer))
}
