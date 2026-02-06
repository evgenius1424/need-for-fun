# Shared Rust Physics Kernel (Server + WASM)

## What is now unified
Movement/collision physics now lives in one Rust crate:
- `shared/physics_core`

Used by:
- Server native Rust via `physics_core` path dependency
- Client browser via `wasm32-unknown-unknown` + `wasm-bindgen`

## Kernel vs non-kernel boundaries

### Inside kernel (`shared/physics_core`)
- Physics constants (`constants.rs`)
- Player state/input types (`types.rs`)
- Tile map collision interface (`tilemap.rs`)
- Tick-step movement and collision (`step.rs`)

### Outside kernel
- Client frame accumulator, interpolation alpha, rendering, sound
- Server room networking/orchestration
- RNG/gameplay systems unrelated to movement kernel

## Module layout
- `shared/physics_core/src/constants.rs`
- `shared/physics_core/src/types.rs`
- `shared/physics_core/src/tilemap.rs`
- `shared/physics_core/src/step.rs`
- `shared/physics_core/src/wasm.rs` (feature `wasm`)

## Server integration
- `server/src/physics.rs` is now thin glue:
  - adapts `GameMap` to `physics_core::tilemap::TileMap`
  - forwards to `physics_core::step::step_player`
- Server `WEAPON_COUNT` now re-exports from shared kernel constants.

## Client integration
- `src/engine/core/physics.js` now orchestrates only:
  - fixed-frame stepping (`FRAME_MS`, `MAX_TICKS_PER_FRAME`)
  - interpolation alpha
  - per-player WASM state handles
- Physics math/collision checks are no longer implemented in JS.
- Map grid is uploaded once to WASM via flat `u8` grid (`0/1`).

## Build WASM
1. Install wasm-pack (once):
   - `cargo install wasm-pack`
2. Build wasm physics module from repo root:
   - `npm run build:wasm`

This generates:
- `src/engine/wasm/physics_core.js`
- `src/engine/wasm/physics_core_bg.wasm`

The checked-in `src/engine/wasm/physics_core.js` is a placeholder and is replaced by the generated module.

## Parity tests

### Native golden vectors
Run in shared crate:
- `cargo test --manifest-path shared/physics_core/Cargo.toml`

### WASM parity test
Run in shared crate:
- `wasm-pack test --chrome --features wasm shared/physics_core`

WASM parity uses the same golden vector assertions as native.

### One-time migration diff harness
- `node scripts/compare-physics-recordings.mjs <legacy.json> <wasm.json>`
- Input files should contain per-tick entries with `x`, `y`, `vx`, `vy`.
- The script prints tick-level drift and total mismatch count.

## Determinism policy
- Fixed tick only (`16ms`)
- No wall-clock and no RNG in kernel step
- `f32` math in kernel for both native and wasm
- Map boundary outside bounds treated as solid
- Rounding/snap behavior implemented only in Rust

## Performance notes
- Kernel step path does not allocate per tick
- Tile lookup is O(1) on flat grid
- Client WASM bridge reuses persistent wasm state/input/map objects
- No per-tick JSON/serde at JS/WASM boundary
