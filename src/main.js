import { Constants, Input, Settings, WeaponConstants, WeaponId } from './helpers'
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

let lastMouseX = Input.mouseX

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

function applyProjectileHits(player) {
    const allProjectiles = Projectiles.getAll()
    for (const proj of allProjectiles) {
        if (!proj.active) continue
        if (!Projectiles.checkPlayerCollision(player, proj)) continue

        const damage = PROJECTILE_DAMAGE[proj.type]
        if (damage) {
            player.takeDamage(damage, proj.ownerId)
        }
        Projectiles.explode(proj)
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

    // Aim rotation based on mouse movement (NFK style)
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

    // Render
    Render.renderGame(localPlayer)

    requestAnimationFrame(gameLoop)
}

requestAnimationFrame(gameLoop)
