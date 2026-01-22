import { Constants, GameConstants, Input, Settings, WeaponConstants, WeaponId } from './helpers'
import { Map } from './map'
import { Player } from './player'
import { Physics, Render } from './engine'
import { Projectiles } from './projectiles'
import { loadAssets } from './assets'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants

// Load assets first
await loadAssets()

await Map.loadFromQuery()

// Initialize sprites after assets and map are loaded
Render.initSprites()
Render.renderMap()

const localPlayer = new Player()
const respawn = Map.getRandomRespawn()
localPlayer.setXY(respawn.col * BRICK_WIDTH + 10, respawn.row * BRICK_HEIGHT - 24)

Projectiles.onExplosion((x, y, type, proj) => {
    if (type !== 'rocket') return

    const dx = localPlayer.x - x
    const dy = localPlayer.y - y
    const distance = Math.hypot(dx, dy)
    const radius = 90

    if (distance >= radius) return

    const falloff = 1 - distance / radius
    const damage = WeaponConstants.DAMAGE[WeaponId.ROCKET] * falloff
    if (damage > 0) {
        localPlayer.takeDamage(damage, proj?.ownerId ?? localPlayer.id)
    }

    if (distance > 0) {
        const knockback = 4 * falloff
        localPlayer.velocityX += (dx / distance) * knockback
        localPlayer.velocityY += (dy / distance) * knockback
    }
})

let lastMouseX = Input.mouseX
let lastMoveDir = 0

const gameRoot = document.getElementById('game')
gameRoot?.addEventListener('click', () => {
    const canvas = gameRoot.querySelector('canvas')
    if (!canvas) return
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock()
    }
})

const PROJECTILE_DAMAGE = {
    rocket: WeaponConstants.DAMAGE[WeaponId.ROCKET],
    grenade: WeaponConstants.DAMAGE[WeaponId.GRENADE],
    plasma: WeaponConstants.DAMAGE[WeaponId.PLASMA],
    bfg: WeaponConstants.DAMAGE[WeaponId.BFG],
}

const ITEM_DEFS = {
    health5: { kind: 'health', amount: 5, max: GameConstants.MAX_HEALTH, respawn: 300 },
    health25: { kind: 'health', amount: 25, max: GameConstants.MAX_HEALTH, respawn: 300 },
    health50: { kind: 'health', amount: 50, max: GameConstants.MAX_HEALTH, respawn: 600 },
    health100: { kind: 'health', amount: 100, max: GameConstants.MEGA_HEALTH, respawn: 900 },
    armor50: { kind: 'armor', amount: 50, respawn: 600 },
    armor100: { kind: 'armor', amount: 100, respawn: 900 },
    quad: { kind: 'quad', respawn: 1200 },
    weapon_machine: { kind: 'weapon', weaponId: WeaponId.MACHINE, respawn: 600 },
    weapon_shotgun: { kind: 'weapon', weaponId: WeaponId.SHOTGUN, respawn: 600 },
    weapon_grenade: { kind: 'weapon', weaponId: WeaponId.GRENADE, respawn: 600 },
    weapon_rocket: { kind: 'weapon', weaponId: WeaponId.ROCKET, respawn: 600 },
}

function applyProjectileHits(player) {
    const allProjectiles = Projectiles.getAll()
    for (const proj of allProjectiles) {
        if (!proj.active) continue
        if (!Projectiles.checkPlayerCollision(player, proj)) continue

        let damage = PROJECTILE_DAMAGE[proj.type]
        if (damage && proj.ownerId === localPlayer.id && localPlayer.quadDamage) {
            damage *= GameConstants.QUAD_MULTIPLIER
        }
        if (damage) {
            player.takeDamage(damage, proj.ownerId)
        }
        Projectiles.explode(proj)
    }
}

function updateItems(player) {
    const items = Map.getItems()
    for (const item of items) {
        if (!item.active) {
            if (item.respawnTimer > 0) item.respawnTimer--
            if (item.respawnTimer <= 0) {
                item.active = true
            }
            continue
        }

        const def = ITEM_DEFS[item.type]
        if (!def) continue

        const x = item.col * Constants.BRICK_WIDTH + Constants.BRICK_WIDTH / 2
        const y = item.row * Constants.BRICK_HEIGHT + Constants.BRICK_HEIGHT / 2
        const dx = player.x - x
        const dy = player.y - y
        const distance = Math.hypot(dx, dy)

        if (distance > 16) continue

        if (def.kind === 'health') {
            player.giveHealth(def.amount, def.max)
        } else if (def.kind === 'armor') {
            player.giveArmor(def.amount)
        } else if (def.kind === 'quad') {
            player.quadDamage = true
            player.quadTimer = GameConstants.QUAD_DURATION
        } else if (def.kind === 'weapon') {
            player.giveWeapon(def.weaponId, WeaponConstants.AMMO_PICKUP[def.weaponId] ?? 0)
        }

        item.active = false
        item.respawnTimer = def.respawn
    }
}

function gameLoop(timestamp) {
    // Movement input
    localPlayer.keyUp = Input.keyUp
    localPlayer.keyDown = Input.keyDown
    localPlayer.keyLeft = Input.keyLeft
    localPlayer.keyRight = Input.keyRight

    // Weapon switching
    if (Input.weaponSwitch >= 0) {
        localPlayer.switchWeapon(Input.weaponSwitch)
        Input.weaponSwitch = -1
    }

    // Aim rotation based on mouse movement
    if (Input.pointerLocked) {
        if (Input.mouseDeltaX !== 0) {
            const cappedDelta = Math.max(-12, Math.min(12, Input.mouseDeltaX))
            localPlayer.updateAimAngle(cappedDelta * Settings.aimSensitivity)
            Input.mouseDeltaX = 0
        }
    } else {
        const mouseDeltaX = Input.mouseX - lastMouseX
        lastMouseX = Input.mouseX
        if (mouseDeltaX !== 0) {
            localPlayer.updateAimAngle(mouseDeltaX * Settings.aimSensitivity)
        }
    }

    // Mirror aim when changing horizontal movement direction
    const moveDir = Input.keyLeft ? -1 : Input.keyRight ? 1 : 0
    if (moveDir !== 0 && moveDir !== lastMoveDir) {
        localPlayer.aimAngle = Math.PI - localPlayer.aimAngle
        while (localPlayer.aimAngle > Math.PI) localPlayer.aimAngle -= Math.PI * 2
        while (localPlayer.aimAngle < -Math.PI) localPlayer.aimAngle += Math.PI * 2
        lastMoveDir = moveDir
    } else if (moveDir !== 0) {
        lastMoveDir = moveDir
    }

    // Firing
    if (Input.mouseDown && !localPlayer.dead) {
        const fireResult = localPlayer.fire()
        if (fireResult?.type === 'rail') {
            Render.addRailShot(fireResult)
        }
    }

    // Update player timers (cooldowns, respawn, quad)
    localPlayer.update()

    // Physics only runs if player is alive
    if (!localPlayer.dead) {
        Physics.updateGame(localPlayer, timestamp)
    }

    // Update projectiles
    Projectiles.update()
    applyProjectileHits(localPlayer)
    updateItems(localPlayer)

    // Render
    Render.renderGame(localPlayer)

    requestAnimationFrame(gameLoop)
}

requestAnimationFrame(gameLoop)
