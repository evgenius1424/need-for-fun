import { Sound } from '../core/helpers'
import { Physics, PhysicsConstants } from './physics'

const EXPLODE_SOUND = {
    rocket: Sound.rocketExplode,
    grenade: Sound.grenadeExplode,
    plasma: Sound.plasmaHit,
    bfg: Sound.plasmaHit,
}

const PROJECTILE_KIND = Object.freeze({ rocket: 0, grenade: 1, plasma: 2, bfg: 3 })
const KIND_TO_TYPE = Object.freeze(['rocket', 'grenade', 'plasma', 'bfg'])

const state = {
    projectiles: [],
    nextId: 0,
    explosionCallbacks: [],
    scratch: new Float32Array(12),
}

export const Projectiles = {
    create(type, x, y, velocityX, velocityY, ownerId) {
        const id = state.nextId++
        const proj = createProjectile({
            id,
            type,
            x,
            y,
            velocityX,
            velocityY,
            ownerId,
            age: 0,
            active: true,
        })
        state.projectiles.push(proj)
        return proj
    },

    update(steps = 1) {
        if (!Physics.hasMap()) return

        let remaining = Math.max(0, steps | 0)
        while (remaining-- > 0) {
            for (let i = state.projectiles.length - 1; i >= 0; i--) {
                const proj = state.projectiles[i]

                if (!proj.active) {
                    proj.wasm?.free()
                    state.projectiles.splice(i, 1)
                    continue
                }

                const exploded = Physics.stepWasmProjectile(proj.wasm)
                syncProjectileFromWasm(proj)
                if (exploded) {
                    this.explode(proj, { syncedWithWasm: true })
                }
            }
        }
    },

    explode(proj, options = {}) {
        if (!proj?.active && !options.syncedWithWasm) return
        proj.active = false
        if (!options.syncedWithWasm && proj.wasm) {
            proj.wasm.import_host_state(
                proj.x,
                proj.y,
                proj.velocityX,
                proj.velocityY,
                proj.age,
                false,
            )
        }
        EXPLODE_SOUND[proj.type]?.()
        for (const cb of state.explosionCallbacks) {
            cb(proj.x, proj.y, proj.type, proj)
        }
    },

    onExplosion(callback) {
        state.explosionCallbacks.push(callback)
    },

    checkPlayerCollision(player, proj) {
        if (!proj.active) return false
        const c = PhysicsConstants
        if (proj.ownerId === player.id && proj.age < c.SELF_HIT_GRACE) return false
        if (proj.type === 'grenade' && proj.age < c.GRENADE_HIT_GRACE) return false

        const dx = player.x - proj.x
        const dy = player.y - proj.y
        const radius = c.HIT_RADIUS[proj.type] ?? 20

        return dx * dx + dy * dy < radius * radius
    },

    getAll: () => state.projectiles,

    replaceAll(projectiles) {
        const prev = new Map()
        for (const p of state.projectiles) {
            prev.set(p.id, p)
        }
        const nextProjectiles = []
        if (!Array.isArray(projectiles)) {
            for (const stale of prev.values()) {
                stale.wasm?.free()
            }
            state.projectiles = []
            return
        }
        for (const proj of projectiles) {
            if (!proj) continue
            const id = normalizeHostId(proj.id)
            const resolvedId = id ?? state.nextId++
            const old = prev.get(resolvedId)
            const next = {
                id: resolvedId,
                type: proj.type ?? proj.kind ?? old?.type ?? 'rocket',
                x: proj.x,
                y: proj.y,
                prevX: old?.x ?? proj.prevX ?? proj.x,
                prevY: old?.y ?? proj.prevY ?? proj.y,
                velocityX: proj.velocityX ?? proj.velocity_x ?? 0,
                velocityY: proj.velocityY ?? proj.velocity_y ?? 0,
                ownerId: proj.ownerId ?? proj.owner_id ?? -1,
                age: proj.age ?? 0,
                active: proj.active ?? true,
            }
            if (old) {
                prev.delete(resolvedId)
                hydrateProjectile(old, next)
                nextProjectiles.push(old)
            } else {
                nextProjectiles.push(createProjectile(next))
            }
            state.nextId = Math.max(state.nextId, resolvedId + 1)
        }
        for (const stale of prev.values()) {
            stale.wasm?.free()
        }
        state.projectiles = nextProjectiles
    },

    spawnFromServer(event) {
        if (!event) return
        const id = normalizeHostId(event.id)
        const type = event.kind ?? event.projectileType ?? event.projectile_type
        if (id == null || !type) return

        let existing = null
        for (const proj of state.projectiles) {
            if (proj.id === id) {
                existing = proj
                break
            }
        }

        const x = event.x ?? 0
        const y = event.y ?? 0
        const velocityX = event.velocityX ?? event.velocity_x ?? 0
        const velocityY = event.velocityY ?? event.velocity_y ?? 0
        const ownerId = event.ownerId ?? event.owner_id ?? -1

        if (existing) {
            hydrateProjectile(existing, {
                type,
                x,
                y,
                velocityX,
                velocityY,
                ownerId,
                age: existing.age,
                active: true,
            })
            return
        }

        state.projectiles.push(
            createProjectile({
                id,
                type,
                x,
                y,
                prevX: x,
                prevY: y,
                velocityX,
                velocityY,
                ownerId,
                age: 0,
                active: true,
            }),
        )
        state.nextId = Math.max(state.nextId, id + 1)
    },

    removeById(id, x, y, kind, options = {}) {
        const emitEffects = options.emitEffects !== false
        const numId = normalizeHostId(id)
        if (numId == null) return
        for (let i = 0; i < state.projectiles.length; i++) {
            if (state.projectiles[i].id !== numId) continue
            const proj = state.projectiles[i]
            proj.x = x
            proj.y = y
            proj.active = false
            state.projectiles.splice(i, 1)
            if (emitEffects) {
                EXPLODE_SOUND[proj.type]?.()
                for (const cb of state.explosionCallbacks) {
                    cb(proj.x, proj.y, proj.type, proj)
                }
            }
            proj.wasm?.free()
            return
        }
    },

    clear() {
        for (const proj of state.projectiles) {
            proj.wasm?.free()
        }
        state.projectiles.length = 0
    },
}

function createProjectile(values) {
    const id = normalizeHostId(values.id) ?? state.nextId++
    const type = values.type ?? 'rocket'
    const x = values.x ?? 0
    const y = values.y ?? 0
    const velocityX = values.velocityX ?? values.velocity_x ?? 0
    const velocityY = values.velocityY ?? values.velocity_y ?? 0
    const ownerId = values.ownerId ?? values.owner_id ?? -1
    const age = values.age ?? 0
    const active = values.active ?? true

    const proj = {
        id,
        type,
        x,
        y,
        prevX: values.prevX ?? x,
        prevY: values.prevY ?? y,
        velocityX,
        velocityY,
        ownerId,
        age,
        active,
        wasm: Physics.createWasmProjectile(
            BigInt(id),
            kindFromType(type),
            x,
            y,
            velocityX,
            velocityY,
            toWasmU64(ownerId),
        ),
    }
    proj.wasm.import_host_state(x, y, velocityX, velocityY, age, active)
    return proj
}

function hydrateProjectile(target, source) {
    target.type = source.type ?? target.type
    target.x = source.x ?? target.x
    target.y = source.y ?? target.y
    target.prevX = source.prevX ?? target.x
    target.prevY = source.prevY ?? target.y
    target.velocityX = source.velocityX ?? source.velocity_x ?? target.velocityX
    target.velocityY = source.velocityY ?? source.velocity_y ?? target.velocityY
    target.ownerId = source.ownerId ?? source.owner_id ?? target.ownerId
    target.age = source.age ?? target.age ?? 0
    target.active = source.active ?? target.active ?? true
    target.wasm.import_host_state(
        target.x,
        target.y,
        target.velocityX,
        target.velocityY,
        target.age,
        target.active,
    )
}

function syncProjectileFromWasm(proj) {
    proj.wasm.export_to_host(state.scratch)
    proj.type = KIND_TO_TYPE[(state.scratch[0] | 0) & 0xff] ?? proj.type
    proj.x = state.scratch[1]
    proj.y = state.scratch[2]
    proj.prevX = state.scratch[3]
    proj.prevY = state.scratch[4]
    proj.velocityX = state.scratch[5]
    proj.velocityY = state.scratch[6]
    proj.age = state.scratch[7] | 0
    proj.active = state.scratch[8] > 0.5
}

function kindFromType(type) {
    return PROJECTILE_KIND[type] ?? PROJECTILE_KIND.rocket
}

function normalizeHostId(value) {
    const numeric = Number(value)
    if (Number.isInteger(numeric) && numeric >= 0) return numeric
    return null
}

function toWasmU64(value) {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
    if (typeof value === 'string') {
        try {
            return BigInt(value)
        } catch {
            return 0n
        }
    }
    return 0n
}
