import { ensurePhysicsCoreWasm } from './physicsCoreLoader'

let wasmReadyPromise = null

export function initWasm() {
    if (!wasmReadyPromise) {
        wasmReadyPromise = ensurePhysicsCoreWasm().catch((error) => {
            wasmReadyPromise = null
            throw error
        })
    }
    return wasmReadyPromise
}
