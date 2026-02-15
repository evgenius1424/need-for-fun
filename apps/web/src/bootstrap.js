import { initWasm } from './engine/wasmRuntime/initWasm'

await initWasm()
await import('./main')
