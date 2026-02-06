# Physics Parity Audit (JS vs Rust) and WASM Unification Plan

## Scope
This audit compares:
- Client physics: `src/engine/core/physics.js` + player collision caches in `src/player.js`
- Server physics: `server/src/physics.rs`

It focuses on movement/collision simulation only (not rendering interpolation, sounds, UI, or networking).

## What Was Copied

### 1) Core movement equations: copied nearly 1:1
Copied formulas match in both implementations:
- Gravity and vertical damping/boost (`+0.056`, divide by `1.11`, multiply by `1.1`)
- Horizontal friction split (ground `1.14`, air `1.025`)
- Horizontal acceleration (`0.35`) and turn acceleration (`0.8`)
- Clamp velocities to `[-5, 5]`
- Speed-jump arrays (`SPEED_JUMP_X`, `SPEED_JUMP_Y`)

Status: **high parity**.

### 2) Jump/crouch behavior: copied nearly 1:1
Copied behavior includes:
- Double-jump timing window and reset values
- Speed-jump increment/reset rules
- Crouch rules and crouch ceiling handling
- Wall snap probes and snap positions

Status: **high parity**.

### 3) Ground/head collision cache checks: copied nearly 1:1
Copied checks include:
- Ground/head probe logic
- Boundary handling (top/bottom treated as collision)
- Narrow crouch checks

Recent fix applied: crouch X-probe now uses dedicated width constant (`PLAYER_CROUCH_HALF_W`) instead of height-named constant.

Status: **high parity after fix**.

### 4) State progression model: mostly copied, but driver differs
- JS uses frame accumulator + interpolation alpha (`FRAME_MS`, `MAX_TICKS_PER_FRAME`, `alpha`)
- Server runs fixed tick loop at 16ms

Kernel math is similar, but frame driving and interpolation are client-only concerns.

Status: **intentional divergence**.

## Estimated Copy Percentage
For movement/collision kernel only:
- **~85-90% copied/equivalent logic**

Not copied (or intentionally different):
- Client-only logging/sounds/interpolation
- Runtime orchestration (client frame accumulator vs server tick task)

## Why This Still Matters
Even with high parity, duplicated implementations cause drift risk:
- Bug fixes must be done twice
- Constants can diverge over time
- Prediction/reconciliation mismatches become harder to debug

## How WASM Can Unify It

## Recommended architecture
Create a shared Rust crate (for example `shared/physics_core`) that contains:
- Player state struct
- Input struct
- Pure step function(s):
  - `step_player(state, input, map)`
  - optional `step_players(...)`
- Collision helpers and constants

Compile the same crate to:
- Native Rust for server
- `wasm32-unknown-unknown` for browser client

Keep outside the shared kernel:
- Server networking, room/task actor loop
- Client rendering, interpolation alpha, sound/logging

## Expected benefits
- Single source of truth for simulation behavior
- Better prediction parity and fewer reconciliation artifacts
- One bugfix path for movement/collision
- Easier tuning: constants changed once

## Important constraints for deterministic behavior
- Keep kernel pure: no wall-clock time, no RNG inside movement step
- Use fixed dt/tick steps only
- Keep constants shared from one module
- Serialize state explicitly (avoid hidden platform-specific behavior)

## Practical rollout plan
1. Move `PlayerState`, `PlayerInput`, constants, and pure movement/collision functions into shared crate.
2. Call shared crate from server `physics.rs` (native target).
3. Expose same functions to JS via wasm-bindgen (or wasm interface layer).
4. Keep existing JS driver/render loop, but replace JS physics math with WASM calls.
5. Add parity tests with golden vectors:
   - same initial state + inputs + map -> same outputs on native and wasm.

## Bottom Line
Current server physics is already largely copied from JS and close in behavior. A shared Rust+WASM physics kernel is the right path to fully unify behavior and eliminate long-term drift.
