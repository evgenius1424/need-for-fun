let wasmModule = null
let wasmModulePromise = null

export async function initWasm() {
    if (wasmModule) return wasmModule

    if (!wasmModulePromise) {
        wasmModulePromise = import('./wasm/wasm.js')
            .then(async (module) => {
                await module.default()
                wasmModule = module
                return module
            })
            .catch((error) => {
                wasmModulePromise = null
                throw error
            })
    }

    return wasmModulePromise
}

export function getWasmModuleSync() {
    if (!wasmModule) {
        throw new Error('WASM module is not initialized. Call initWasm() first.')
    }
    return wasmModule
}

export function isWasmModuleReady() {
    return wasmModule !== null
}
