let physicsCoreModule = null
let physicsCoreModulePromise = null

export async function ensurePhysicsCoreWasm() {
    if (physicsCoreModule) return physicsCoreModule

    if (!physicsCoreModulePromise) {
        physicsCoreModulePromise = import('../wasm/physics_core.js')
            .then(async (module) => {
                await module.default()
                physicsCoreModule = module
                return module
            })
            .catch((error) => {
                physicsCoreModulePromise = null
                throw error
            })
    }

    return physicsCoreModulePromise
}

export function getPhysicsCoreWasmSync() {
    if (!physicsCoreModule) {
        throw new Error('WASM module physics_core is not initialized. Call initWasm() first.')
    }
    return physicsCoreModule
}

export function isPhysicsCoreWasmReady() {
    return physicsCoreModule !== null
}
