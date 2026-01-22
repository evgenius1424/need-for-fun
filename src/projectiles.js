import { Constants, Sound } from './helpers'
import { Map } from './map'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants

const projectiles = []
let nextId = 0
const explosionCallbacks = []

export const Projectiles = {
    create(type, x, y, velocityX, velocityY, ownerId) {
        const proj = {
            id: nextId++,
            type,
            x,
            y,
            velocityX,
            velocityY,
            ownerId,
            age: 0,
            active: true,
        }
        projectiles.push(proj)
        return proj
    },

    update() {
        const gravity = 0.1
        const bounceDecay = 0.6
        const cols = Map.getCols()
        const rows = Map.getRows()

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const proj = projectiles[i]
            if (!proj.active) {
                projectiles.splice(i, 1)
                continue
            }

            proj.age++

            if (proj.type === 'grenade') {
                proj.velocityY += gravity
            }

            let newX = proj.x + proj.velocityX
            let newY = proj.y + proj.velocityY

            const colX = Math.floor(newX / BRICK_WIDTH)
            const colY = Math.floor(newY / BRICK_HEIGHT)

            if (Map.isBrick(colX, colY)) {
                if (proj.type === 'grenade') {
                    const oldColX = Math.floor(proj.x / BRICK_WIDTH)
                    const oldColY = Math.floor(proj.y / BRICK_HEIGHT)

                    if (oldColX !== colX) {
                        proj.velocityX = -proj.velocityX * bounceDecay
                        newX = proj.x + proj.velocityX
                    }
                    if (oldColY !== colY) {
                        proj.velocityY = -proj.velocityY * bounceDecay
                        newY = proj.y + proj.velocityY
                    }

                    if (Math.abs(proj.velocityX) < 0.5 && Math.abs(proj.velocityY) < 0.5) {
                        proj.velocityX = 0
                        proj.velocityY = 0
                    }
                } else {
                    this.explode(proj)
                    continue
                }
            }

            proj.x = newX
            proj.y = newY

            if (proj.type === 'grenade' && proj.age > 150) {
                this.explode(proj)
                continue
            }

            if (
                proj.x < -100 ||
                proj.x > cols * BRICK_WIDTH + 100 ||
                proj.y < -100 ||
                proj.y > rows * BRICK_HEIGHT + 100
            ) {
                proj.active = false
            }
        }
    },

    explode(proj) {
        proj.active = false

        if (proj.type === 'rocket') {
            Sound.rocketExplode()
        } else if (proj.type === 'grenade') {
            Sound.grenadeExplode()
        } else if (proj.type === 'plasma' || proj.type === 'bfg') {
            Sound.plasmaHit()
        }

        for (const callback of explosionCallbacks) {
            callback(proj.x, proj.y, proj.type, proj)
        }
    },

    onExplosion(callback) {
        explosionCallbacks.push(callback)
    },

    checkPlayerCollision(player, proj) {
        if (!proj.active) return false
        if (proj.ownerId === player.id && proj.age < 8) return false

        const dx = player.x - proj.x
        const dy = player.y - proj.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        let hitRadius = 20
        if (proj.type === 'rocket' || proj.type === 'grenade' || proj.type === 'bfg') {
            hitRadius = 60
        }

        return distance < hitRadius
    },

    getAll() {
        return projectiles
    },

    clear() {
        projectiles.length = 0
    },
}
