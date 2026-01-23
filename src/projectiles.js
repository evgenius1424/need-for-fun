import { Constants, Sound } from './helpers'
import { Map } from './map'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants

const GRAVITY = 0.18
const BOUNCE_DECAY = 0.75
const GRENADE_FUSE = 180
const GRENADE_MIN_VELOCITY = 0.5
const BOUNDS_MARGIN = 100
const SELF_HIT_GRACE = 8
const GRENADE_HIT_GRACE = 12

const HIT_RADIUS = { rocket: 28, bfg: 28, grenade: 16, plasma: 20 }

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
        const cols = Map.getCols()
        const rows = Map.getRows()
        const maxX = cols * BRICK_WIDTH + BOUNDS_MARGIN
        const maxY = rows * BRICK_HEIGHT + BOUNDS_MARGIN

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const proj = state.projectiles[i]

            if (!proj.active) {
                state.projectiles.splice(i, 1)
                continue
            }

            proj.age++

            if (proj.type === 'grenade') {
                applyGrenadePhysics(proj)
            }

            const newX = proj.x + proj.velocityX
            const newY = proj.y + proj.velocityY

            if (checkWallCollision(proj, newX, newY)) continue

            proj.x = newX
            proj.y = newY

            if (proj.type === 'grenade' && proj.age > GRENADE_FUSE) {
                this.explode(proj)
                continue
            }

            if (
                proj.x < -BOUNDS_MARGIN ||
                proj.x > maxX ||
                proj.y < -BOUNDS_MARGIN ||
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
        if (proj.ownerId === player.id && proj.age < SELF_HIT_GRACE) return false
        if (proj.type === 'grenade' && proj.age < GRENADE_HIT_GRACE) return false

        const dx = player.x - proj.x
        const dy = player.y - proj.y
        const radius = HIT_RADIUS[proj.type] ?? 20

        return dx * dx + dy * dy < radius * radius
    },

    getAll: () => state.projectiles,

    clear() {
        state.projectiles.length = 0
    },
}

function applyGrenadePhysics(proj) {
    const speed = Math.hypot(proj.velocityX, proj.velocityY)
    proj.velocityY += GRAVITY + speed * 0.02
    proj.velocityX *= 0.995
}

function checkWallCollision(proj, newX, newY) {
    const colX = Math.floor(newX / BRICK_WIDTH)
    const colY = Math.floor(newY / BRICK_HEIGHT)

    if (!Map.isBrick(colX, colY)) return false

    if (proj.type !== 'grenade') {
        Projectiles.explode(proj)
        return true
    }

    const oldColX = Math.floor(proj.x / BRICK_WIDTH)
    const oldColY = Math.floor(proj.y / BRICK_HEIGHT)

    if (oldColX !== colX) proj.velocityX *= -BOUNCE_DECAY
    if (oldColY !== colY) proj.velocityY *= -BOUNCE_DECAY

    if (
        Math.abs(proj.velocityX) < GRENADE_MIN_VELOCITY &&
        Math.abs(proj.velocityY) < GRENADE_MIN_VELOCITY
    ) {
        proj.velocityX = 0
        proj.velocityY = 0
    }

    return false
}
