import { PhysicsConstants } from './physics'

// Canonical values live in Rust: crates/physics_core/src/constants.rs.
// These are loaded from WASM so JS stays in sync.
function topOffset(player) {
    return player?.crouch
        ? PhysicsConstants.PLAYER_HITBOX_TOP_CROUCH
        : PhysicsConstants.PLAYER_HITBOX_TOP_STAND
}

export function getPlayerHitbox(player, padding = 0) {
    const halfW = PhysicsConstants.PLAYER_HITBOX_HALF_W + padding
    const top = topOffset(player) + padding
    const bottom = PhysicsConstants.PLAYER_HITBOX_BOTTOM + padding
    return {
        minX: player.x - halfW,
        maxX: player.x + halfW,
        minY: player.y - top,
        maxY: player.y + bottom,
    }
}

// Liang-Barsky segment clipping with no heap allocations (hot path).
export function segmentAabbT(x0, y0, x1, y1, box) {
    const dx = x1 - x0
    const dy = y1 - y0
    let tMin = 0
    let tMax = 1

    if (Math.abs(dx) < Number.EPSILON) {
        if (x0 < box.minX || x0 > box.maxX) return null
    } else {
        const inv = 1 / dx
        let t1 = (box.minX - x0) * inv
        let t2 = (box.maxX - x0) * inv
        if (t1 > t2) [t1, t2] = [t2, t1]
        tMin = Math.max(tMin, t1)
        tMax = Math.min(tMax, t2)
        if (tMin > tMax) return null
    }

    if (Math.abs(dy) < Number.EPSILON) {
        if (y0 < box.minY || y0 > box.maxY) return null
    } else {
        const inv = 1 / dy
        let t1 = (box.minY - y0) * inv
        let t2 = (box.maxY - y0) * inv
        if (t1 > t2) [t1, t2] = [t2, t1]
        tMin = Math.max(tMin, t1)
        tMax = Math.min(tMax, t2)
        if (tMin > tMax) return null
    }

    return Math.min(1, Math.max(0, tMin))
}
