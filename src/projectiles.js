import { Sound } from './helpers'
import { Map as GameMap } from './map'
import { PhysicsConstants } from './engine/core/physics'

const EXPLODE_SOUND = {
    rocket: Sound.rocketExplode,
    grenade: Sound.grenadeExplode,
    plasma: Sound.plasmaHit,
    bfg: Sound.plasmaHit,
}

const state = { projectiles: [], nextId: 0, explosionCallbacks: [] }

export const Projectiles = {
    create(type, x, y, velocityX, velocityY, ownerId) {
        const proj = {
            id: state.nextId++,
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
        }
        state.projectiles.push(proj)
        return proj
    },

    update() {
        const cols = GameMap.getCols()
        const rows = GameMap.getRows()
        const c = PhysicsConstants // Capture once per frame
        const maxX = cols * PhysicsConstants.TILE_W + c.BOUNDS_MARGIN
        const maxY = rows * PhysicsConstants.TILE_H + c.BOUNDS_MARGIN

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const proj = state.projectiles[i]

            if (!proj.active) {
                state.projectiles.splice(i, 1)
                continue
            }

            proj.prevX = proj.x
            proj.prevY = proj.y
            proj.age++

            if (proj.type === 'grenade') {
                applyGrenadePhysics(proj, c)
            }

            const newX = proj.x + proj.velocityX
            const newY = proj.y + proj.velocityY

            if (checkWallCollision(proj, newX, newY, c)) continue

            proj.x = newX
            proj.y = newY

            if (proj.type === 'grenade' && proj.age > c.GRENADE_FUSE) {
                this.explode(proj)
                continue
            }

            if (
                proj.x < -c.BOUNDS_MARGIN ||
                proj.x > maxX ||
                proj.y < -c.BOUNDS_MARGIN ||
                proj.y > maxY
            ) {
                proj.active = false
            }
        }
    },

    explode(proj) {
        proj.active = false
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
        const prev = new window.Map()
        for (const p of state.projectiles) {
            prev.set(p.id, p)
        }
        state.projectiles.length = 0
        if (!Array.isArray(projectiles)) return
        for (const proj of projectiles) {
            if (!proj) continue
            const old = prev.get(proj.id)
            state.projectiles.push({
                id: proj.id ?? state.nextId++,
                type: proj.type,
                x: proj.x,
                y: proj.y,
                prevX: old?.x ?? proj.prevX ?? proj.x,
                prevY: old?.y ?? proj.prevY ?? proj.y,
                velocityX: proj.velocityX ?? proj.velocity_x ?? 0,
                velocityY: proj.velocityY ?? proj.velocity_y ?? 0,
                ownerId: proj.ownerId ?? proj.owner_id ?? -1,
                age: proj.age ?? 0,
                active: proj.active ?? true,
            })
        }
    },

    spawnFromServer(event) {
        if (!event) return
        const id = event.id
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
            existing.type = type
            existing.x = x
            existing.y = y
            existing.velocityX = velocityX
            existing.velocityY = velocityY
            existing.ownerId = ownerId
            existing.active = true
            return
        }

        state.projectiles.push({
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
        })
    },

    clear() {
        state.projectiles.length = 0
    },
}

function applyGrenadePhysics(proj, c) {
    proj.velocityY += c.GRAVITY
    if (proj.velocityY < 0) {
        proj.velocityY /= c.GRENADE_RISE_DAMPING
    }
    proj.velocityX /= c.GRENADE_AIR_FRICTION
    if (proj.velocityY > c.GRENADE_MAX_FALL_SPEED) {
        proj.velocityY = c.GRENADE_MAX_FALL_SPEED
    }
}

function checkWallCollision(proj, newX, newY, c) {
    const colX = Math.floor(newX / PhysicsConstants.TILE_W)
    const colY = Math.floor(newY / PhysicsConstants.TILE_H)

    if (!GameMap.isBrick(colX, colY)) return false

    if (proj.type !== 'grenade') {
        Projectiles.explode(proj)
        return true
    }

    const oldColX = Math.floor(proj.x / PhysicsConstants.TILE_W)
    const oldColY = Math.floor(proj.y / PhysicsConstants.TILE_H)

    if (oldColX !== colX) proj.velocityX = -proj.velocityX / c.GRENADE_BOUNCE_FRICTION
    if (oldColY !== colY) proj.velocityY = -proj.velocityY / c.GRENADE_BOUNCE_FRICTION

    if (
        Math.abs(proj.velocityX) < c.GRENADE_MIN_VELOCITY &&
        Math.abs(proj.velocityY) < c.GRENADE_MIN_VELOCITY
    ) {
        proj.velocityX = 0
        proj.velocityY = 0
    }

    return false
}
