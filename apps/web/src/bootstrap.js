import { initWasm } from './engine/wasmClient'

await initWasm()
await import('./main')
