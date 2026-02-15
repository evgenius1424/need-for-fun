# Need For Fun 🕹️

Need For Fun is a fast 2D arena shooter with a modern monorepo setup:

- **Web client**: Vite + Pixi (`apps/web`)
- **Realtime server**: Rust + Axum WebSocket (`apps/server`)
- **Shared game kernel**: Rust crates compiled natively and to WASM (`crates/*`)

## Project Layout

```text
apps/
  web/                 # Vite game client
  server/              # Rust realtime server
crates/
  shared/
    binary_protocol/   # Shared binary network protocol
    physics_core/      # Shared movement/combat physics (native + wasm)
dist/
  web/                 # Web build output
```

## One-command workflows

> Prerequisites: `node`, `npm`, `rust`, `cargo`, `wasm-pack`

```bash
npm install
```

### Development (client + server)

```bash
npm run dev
```

- Builds fresh WASM bindings first.
- Starts Vite dev server on `http://localhost:8080`.
- Starts Rust game server on `http://localhost:3001`.

### Production build (client + server)

```bash
npm run build
```

- Rebuilds WASM bindings.
- Builds frontend assets into `dist/web`.
- Builds Rust server in release mode.

### Preview the full stack

```bash
npm run preview
```

- Serves built web app via Vite preview.
- Runs Rust server in release mode.

## Focused commands

```bash
npm run wasm:build      # Build shared physics_core to wasm for web client
npm run web:dev         # Start only Vite client
npm run web:build       # Build only web client
npm run server:dev      # Start only Rust server (debug)
npm run server:build    # Build only Rust server (release)
```
