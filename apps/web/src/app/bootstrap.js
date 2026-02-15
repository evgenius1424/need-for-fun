import { initWasm } from '../wasm/client'

await initWasm()
await import('./main')
