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

## Server room management (in-memory, console-first)

The server now has an in-memory room subsystem intended for both current console administration and future UI/API usage.

### Lifecycle

Each room transitions through:

- `created` -> room exists and can accept joins.
- `running` -> at least one player is connected; simulation ticks are active.
- `empty` -> last player left.
- `closing` -> cleanup/teardown in progress.
- `closed` -> task ended and room removed from manager listing.

When the last player leaves, the room automatically goes to `empty`/`closing` and stops ticking.

### Console commands

The server reads console input from stdin. Use:

- `rooms list`
- `rooms create <name> [maxPlayers] [mapId] [mode]`
- `rooms close <roomId|name>`
- `rooms info <roomId|name>`
- `rooms set <roomId|name> maxPlayers <n>`
- `rooms rename <roomId|name> <newName>`

`maxPlayers` defaults to 8 and is hard-capped at 8 for this phase.

### UI-ready API model (internal)

`RoomManager` provides methods that are ready to be reused by a future HTTP/WebSocket UI layer:

- create/list/get/join/leave/close/rename/set-max.
- listing returns `RoomSummary` (id, name, current/max players, map, mode, status, timestamps, protocol/region placeholders).
- `RoomInfo` returns details + player list for debug/admin inspection.

### Notes

- Rooms are public and passwordless.
- No persistence: process restart resets all rooms.
- Metrics are tracked in memory (`rooms_created_total`, `rooms_closed_total`, `players_joined_total`, `players_left_total`, plus current counters via manager state).
