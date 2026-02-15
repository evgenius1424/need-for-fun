import { ensureWasmModule } from './wasmLoader'

let wasmReadyPromise = null

export function initWasm() {
    if (!wasmReadyPromise) {
        wasmReadyPromise = ensureWasmModule().catch((error) => {
            wasmReadyPromise = null
            throw error
        })
    }
    return wasmReadyPromise
}
