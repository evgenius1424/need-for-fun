# Prompt for Coding Agent: Ship Robust Client Netcode Buffering for High-Jitter Internet

You are implementing production-grade client netcode upgrades for a fast-paced browser multiplayer game.

## Product target

Make multiplayer feel **responsive and smooth** on consumer connections with:

- RTT: **55–150 ms**
- Jitter variance: **~100 ms**
- Occasional burst loss / out-of-order packets

Success means:

- local player movement remains responsive and stable (no visible self-jitter),
- remote players animate smoothly (no stutter/teleporting under jitter),
- short ping spikes are visually absorbed rather than producing chunked movement.

---

## Current codebase context (read before coding)

The client already has key building blocks in `src/network.js`:

- snapshot buffering, interpolation delay computation, and underrun boost,
- local reconciliation keyed by `last_input_seq`,
- remote interpolation/extrapolation path,
- runtime net stats and tuning profile support.

Relevant sections to inspect first:

- connection/snapshot handling in `applySnapshot` and `insertSnapshot`,
- reconciliation in `reconcileLocal`,
- render-time smoothing in `updateInterpolation`,
- dynamic delay in `computeInterpDelayMs`.

The game loop currently:

- predicts local movement every frame,
- sends input frequently,
- calls `network.updateInterpolation()` before rendering.

Also verify server snapshot shape includes `tick`, `server_time_ms`, and per-player `last_input_seq`.

---

## What to implement (priority order)

### 1) Tighten local prediction + reconciliation (highest priority)

Goal: eliminate self-jitter while preserving snappy controls.

Implement/verify all of the following:

1. Keep an input history ring buffer with per-input metadata:
    - `seq`,
    - local send timestamp,
    - simulation tick/frame stamp,
    - input payload used by prediction.
2. On snapshot for local player:
    - read authoritative state + `last_input_seq`,
    - discard acked inputs (`seq <= last_input_seq`),
    - rewind local sim state to authoritative snapshot state,
    - replay remaining unacked inputs in order through the same prediction integrator.
3. Correction policy:
    - tiny error: keep predicted pose (deadzone),
    - moderate error: blend over 2–3 frames (position + velocity + aim where applicable),
    - large error/teleport/respawn: snap immediately.
4. Ensure correction is deterministic and does not double-apply one frame of input.

### 2) Harden remote interpolation buffer (second priority)

Goal: make other players smooth despite jitter and uneven delivery.

Implement/verify all of the following:

1. Maintain ordered snapshot history keyed by `tick` and `server_time_ms`.
2. Render remote entities at `server_now - interpolation_delay`.
3. Interpolate between two surrounding snapshots (older/newer).
4. Keep interpolation delay adaptive to measured conditions:
    - baseline from snapshot interval,
    -   - jitter component,
    -   - small RTT component,
    - clamped min/max.
5. Out-of-order snapshots:
    - insert in sorted order,
    - dedupe by tick,
    - avoid regressions in render timeline.
6. Underrun behavior:
    - if no newer snapshot exists, cap extrapolation window,
    - decay back to interpolation mode once new snapshots resume.

### 3) Add dedicated jitter-buffer behavior and guardrails

Goal: steady consumption of snapshot timeline under bursty arrival.

Implement/verify all of the following:

1. Keep a configurable target buffer depth in time (roughly ~2 snapshot intervals as baseline).
2. On repeated underruns, temporarily increase interpolation delay (buffer boost).
3. Slowly decay boost during stable periods.
4. Track and expose metrics:
    - buffer depth (snapshots + ms),
    - underrun events,
    - stale/out-of-order count,
    - extrapolation time.

### 4) Improve small-correction smoothing ergonomics

Goal: corrections become visually invisible while preserving hit accuracy.

Implement/verify all of the following:

1. Position + velocity blended with bounded blend factor.
2. Angle blending via shortest-arc interpolation.
3. Configurable deadzone and smooth max thresholds.
4. Immediate snap whitelist:
    - respawn,
    - teleporter,
    - large displacement beyond threshold.

---

## Non-goals for this task

- Do **not** reduce snapshot send rate (keep ~30 Hz equivalent).
- Do **not** migrate transport to WebRTC in this change.
- Do **not** overhaul server architecture.

---

## Implementation constraints

- Preserve existing public behavior/controls.
- Keep all tuning values centralized and inspectable.
- Prefer small focused utilities over deeply branching monolith functions.
- Keep comments concise and explain “why,” not obvious “what.”

---

## Validation plan (must be automated)

Add/update deterministic tests (or simulation harness) that validate:

1. **Reconciliation correctness**
    - Given authoritative snapshot + unacked input history, replay result is stable and ordered.
2. **Interpolation smoothness under jitter**
    - Feed synthetic snapshot arrivals with varying intervals and out-of-order inserts,
    - verify monotonic render timeline and bounded extrapolation.
3. **Correction policy thresholds**
    - deadzone/mid/large error paths each produce expected behavior.
4. **No render-time hard snaps for moderate drift**
    - assert blend path is used.

If no existing JS test harness exists, add a lightweight one for networking utilities, then document how to run it.

---

## Manual QA checklist

- Simulate 80–120 ms RTT and 60–100 ms jitter in browser devtools/network emulation.
- Confirm:
    - local movement stays responsive,
    - remote player movement remains smooth,
    - temporary ping spikes do not create obvious stutter bursts,
    - debug overlay metrics reflect jitter-buffer adaptation.

---

## Deliverables

1. Code changes implementing/hardening the above.
2. Tuning defaults suitable for 55–150 ms RTT with high jitter.
3. Developer notes documenting:
    - netcode pipeline,
    - tuning knobs and recommended values,
    - troubleshooting playbook for “self jitter” vs “remote jitter.”
4. Tests/harness proving reconciliation and interpolation behavior.
