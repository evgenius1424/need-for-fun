import * as PIXI from 'pixi.js'
import { Console, Constants, Sound, Utils, WeaponConstants } from './helpers'
import { Map } from './map'
import { Projectiles } from './projectiles'
import { getTexture, getProjectileTexture, getWeaponIcon } from './assets'

const { BRICK_WIDTH, BRICK_HEIGHT, PLAYER_MAX_VELOCITY_X } = Constants
const { trunc } = Utils
const { isBrick } = Map

const PLAYER_BASE_SCALE_X = 32 / 48
const PLAYER_BASE_SCALE_Y = 1

const WEAPON_IN_HAND_SCALE = 0.9

const app = new PIXI.Application()
await app.init({
    width: innerWidth,
    height: innerHeight,
    background: 0x262626,
})
app.canvas.style.display = 'block'
document.getElementById('game').appendChild(app.canvas)

const { renderer, stage } = app

// World container (moves with camera)
const worldContainer = new PIXI.Container()
stage.addChild(worldContainer)

// Background tiling sprite (added first, behind everything)
let backgroundSprite = null

// Map tiles container (replaces mapGraphics)
const tileContainer = new PIXI.Container()
worldContainer.addChild(tileContainer)

// Projectiles container with sprite pool
const projectilesContainer = new PIXI.Container()
worldContainer.addChild(projectilesContainer)
const projectilePool = []

// Explosions container with sprite pool
const explosionsContainer = new PIXI.Container()
worldContainer.addChild(explosionsContainer)
const explosionPool = []

// Weapon aim line (keep as Graphics - lines work fine)
const aimLineGraphics = new PIXI.Graphics()
worldContainer.addChild(aimLineGraphics)

// Railgun shots
const railShotsGraphics = new PIXI.Graphics()
worldContainer.addChild(railShotsGraphics)

// Player sprite (replaces localPlayerGraphics)
let playerSprite = null
let playerCenterSprite = null
let weaponSprite = null

// HUD Container (fixed position)
const hudContainer = new PIXI.Container()
stage.addChild(hudContainer)

const healthText = new PIXI.Text({
    text: '100',
    style: {
        fontFamily: 'Arial',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0x00ff00,
        stroke: { color: 0x000000, width: 3 },
    },
})
healthText.x = 20
hudContainer.addChild(healthText)

const armorText = new PIXI.Text({
    text: '0',
    style: {
        fontFamily: 'Arial',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xffff00,
        stroke: { color: 0x000000, width: 2 },
    },
})
armorText.x = 20
hudContainer.addChild(armorText)

const weaponText = new PIXI.Text({
    text: 'Machinegun',
    style: {
        fontFamily: 'Arial',
        fontSize: 20,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
    },
})
weaponText.anchor.set(1, 0)
hudContainer.addChild(weaponText)

const ammoText = new PIXI.Text({
    text: '100',
    style: {
        fontFamily: 'Arial',
        fontSize: 28,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
    },
})
ammoText.anchor.set(1, 0)
hudContainer.addChild(ammoText)

// Explosions array (data)
const explosions = []
const railShots = []

// Projectile colors for tinting
const projectileColors = {
    rocket: 0xff6600,
    plasma: 0x00ffff,
    grenade: 0x666666,
    bfg: 0x00ff00,
}

// Register explosion callback
Projectiles.onExplosion((x, y, type) => {
    const radius = type === 'rocket' || type === 'grenade' || type === 'bfg' ? 40 : 15
    explosions.push({
        x,
        y,
        radius,
        maxRadius: radius,
        age: 0,
        maxAge: 15,
        color: projectileColors[type] || 0xff6600,
    })
})

let floatCamera = false
let halfWidth = 0
let halfHeight = 0
let mapDx = 0
let mapDy = 0
let worldScale = 1

function recalcFloatCamera() {
    renderer.resize(innerWidth - 20, innerHeight)
    const mapWidth = Map.getCols() * BRICK_WIDTH
    const mapHeight = Map.getRows() * BRICK_HEIGHT
    floatCamera = mapHeight > innerHeight || mapWidth > innerWidth - 20

    if (floatCamera) {
        halfWidth = ((innerWidth - 20) / 2) | 0
        halfHeight = (innerHeight / 2) | 0
        worldScale = 1
    } else {
        const scaleToFitX = (innerWidth - 20) / mapWidth
        const scaleToFitY = innerHeight / mapHeight
        worldScale = Math.min(scaleToFitX, scaleToFitY, 1.6)
        mapDx = ((innerWidth - 20 - mapWidth * worldScale) / 2) | 0
        mapDy = ((innerHeight - mapHeight * worldScale) / 2) | 0
    }

    worldContainer.scale.set(worldScale)

    // Update background tiling if exists
    if (backgroundSprite) {
        backgroundSprite.width = innerWidth
        backgroundSprite.height = innerHeight
    }

    // Update HUD positions
    healthText.y = innerHeight - 50
    armorText.y = innerHeight - 80
    weaponText.x = innerWidth - 40
    weaponText.y = innerHeight - 50
    ammoText.x = innerWidth - 40
    ammoText.y = innerHeight - 80
}

addEventListener('resize', recalcFloatCamera)

/**
 * Get or create a projectile sprite from the pool
 */
function getProjectileSprite(type) {
    // Try to find an inactive sprite in the pool
    for (const sprite of projectilePool) {
        if (!sprite.visible) {
            sprite.visible = true
            return sprite
        }
    }

    // Create new sprite if pool is empty
    const texture = getProjectileTexture(type)
    const sprite = new PIXI.Sprite(texture)
    sprite.anchor.set(0.5)
    projectilePool.push(sprite)
    projectilesContainer.addChild(sprite)
    return sprite
}

/**
 * Get or create an explosion sprite from the pool
 */
function getExplosionSprite() {
    // Try to find an inactive sprite in the pool
    for (const sprite of explosionPool) {
        if (!sprite.visible) {
            sprite.visible = true
            return sprite
        }
    }

    // Create new sprite if pool is empty
    const texture = getTexture('explosion')
    const sprite = new PIXI.Sprite(texture)
    sprite.anchor.set(0.5)
    explosionPool.push(sprite)
    explosionsContainer.addChild(sprite)
    return sprite
}

function renderProjectiles() {
    // Hide all projectile sprites first
    for (const sprite of projectilePool) {
        sprite.visible = false
    }

    const allProjectiles = Projectiles.getAll()

    for (const proj of allProjectiles) {
        if (!proj.active) continue

        const sprite = getProjectileSprite(proj.type)
        sprite.texture = getProjectileTexture(proj.type)
        sprite.x = proj.x
        sprite.y = proj.y

        // Rotate based on velocity direction
        sprite.rotation = Math.atan2(proj.velocityY, proj.velocityX)

        // Apply color tint
        sprite.tint = projectileColors[proj.type] || 0xffffff
    }
}

function renderExplosions() {
    // Hide all explosion sprites first
    for (const sprite of explosionPool) {
        sprite.visible = false
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i]
        exp.age++

        if (exp.age > exp.maxAge) {
            explosions.splice(i, 1)
            continue
        }

        const progress = exp.age / exp.maxAge
        const scale = (1 + progress) * (exp.radius / 16) // Scale based on radius
        const alpha = 1 - progress

        const sprite = getExplosionSprite()
        sprite.x = exp.x
        sprite.y = exp.y
        sprite.scale.set(scale)
        sprite.alpha = alpha
        sprite.tint = exp.color
    }
}

function renderAimLine(player) {
    aimLineGraphics.clear()
}

function renderRailShots() {
    railShotsGraphics.clear()

    for (let i = railShots.length - 1; i >= 0; i--) {
        const shot = railShots[i]
        shot.age++
        if (shot.age > shot.maxAge) {
            railShots.splice(i, 1)
            continue
        }

        const progress = shot.age / shot.maxAge
        const alpha = 1 - progress
        const dx = shot.x2 - shot.x1
        const dy = shot.y2 - shot.y1
        const length = Math.hypot(dx, dy) || 1
        const nx = (-dy / length) * (1.5 + Math.random() * 1.5)
        const ny = (dx / length) * (1.5 + Math.random() * 1.5)

        railShotsGraphics
            .moveTo(shot.x1, shot.y1)
            .lineTo(shot.x2, shot.y2)
            .stroke({ width: 6, color: 0x66ddff, alpha: alpha * 0.35 })

        railShotsGraphics
            .moveTo(shot.x1 + nx, shot.y1 + ny)
            .lineTo(shot.x2 + nx, shot.y2 + ny)
            .stroke({ width: 3, color: 0x9ff0ff, alpha: alpha * 0.55 })

        railShotsGraphics
            .moveTo(shot.x1, shot.y1)
            .lineTo(shot.x2, shot.y2)
            .stroke({ width: 2, color: 0xffffff, alpha: alpha })

        railShotsGraphics.circle(shot.x2, shot.y2, 6).fill({ color: 0x9ff0ff, alpha: alpha * 0.6 })
    }
}

function updateHUD(player) {
    healthText.text = Math.max(0, player.health).toString()
    if (player.health > 100) {
        healthText.style.fill = 0x00aaff
    } else if (player.health > 50) {
        healthText.style.fill = 0x00ff00
    } else if (player.health > 25) {
        healthText.style.fill = 0xffff00
    } else {
        healthText.style.fill = 0xff0000
    }

    armorText.text = player.armor.toString()
    armorText.visible = player.armor > 0

    weaponText.text = WeaponConstants.NAMES[player.currentWeapon]

    const ammo = player.ammo[player.currentWeapon]
    ammoText.text = ammo === -1 ? '∞' : ammo.toString()

    if (playerSprite) playerSprite.visible = !player.dead
    if (playerCenterSprite) playerCenterSprite.visible = !player.dead
}

export const Render = {
    initSprites() {
        // Create background tiling sprite
        const bgTexture = getTexture('background')
        if (bgTexture) {
            backgroundSprite = new PIXI.TilingSprite({
                texture: bgTexture,
                width: innerWidth,
                height: innerHeight,
            })
            worldContainer.addChildAt(backgroundSprite, 0)
        }

        // Create player sprite
        const playerTexture = getTexture('player')
        if (playerTexture) {
            playerSprite = new PIXI.Sprite(playerTexture)
            playerSprite.anchor.set(0.5, 0.5)
            playerSprite.scale.set(PLAYER_BASE_SCALE_X, PLAYER_BASE_SCALE_Y)
            // Apply team color (blue by default)
            playerSprite.tint = 0x6f8bff
            worldContainer.addChild(playerSprite)

            // Player center marker
            playerCenterSprite = new PIXI.Graphics()
            playerCenterSprite.rect(-1, -1, 2, 2).fill(0x0000aa)
            worldContainer.addChild(playerCenterSprite)
        }

        weaponSprite = new PIXI.Sprite()
        weaponSprite.anchor.set(0.5, 0.5)
        weaponSprite.scale.set(WEAPON_IN_HAND_SCALE)
        worldContainer.addChild(weaponSprite)
    },

    addRailShot(shot) {
        railShots.push({
            x1: shot.startX,
            y1: shot.startY,
            x2: shot.trace.x,
            y2: shot.trace.y,
            age: 0,
            maxAge: 10,
        })
    },

    renderMap() {
        // Clear existing tile sprites
        tileContainer.removeChildren()

        const rows = Map.getRows()
        const cols = Map.getCols()
        const brickTexture = getTexture('brick')

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (isBrick(col, row)) {
                    const sprite = new PIXI.Sprite(brickTexture)
                    sprite.x = col * 32
                    sprite.y = row * 16

                    // Apply team color based on tile type
                    const tileColor = Map.getTileColor ? Map.getTileColor(col, row) : null
                    if (tileColor) {
                        sprite.tint = tileColor
                    }

                    tileContainer.addChild(sprite)
                }
            }
        }

        app.render()
        recalcFloatCamera()
    },

    renderGame(player) {
        if (floatCamera) {
            worldContainer.x = halfWidth - player.x
            worldContainer.y = halfHeight - player.y

            // Update background tiling offset for parallax effect
            if (backgroundSprite) {
                backgroundSprite.tilePosition.x = -player.x * 0.3
                backgroundSprite.tilePosition.y = -player.y * 0.3
                // Keep background fixed to screen
                backgroundSprite.x = player.x - halfWidth
                backgroundSprite.y = player.y - halfHeight
            }
        } else {
            worldContainer.x = mapDx
            worldContainer.y = mapDy

            if (backgroundSprite) {
                backgroundSprite.x = -mapDx
                backgroundSprite.y = -mapDy
            }
        }

        // Player sprite (world coordinates)
        if (!player.dead && playerSprite) {
            playerSprite.x = player.x

            const crouchScale = player.crouch ? 0.67 : 1
            playerSprite.scale.y = crouchScale * PLAYER_BASE_SCALE_Y
            playerSprite.y = player.y + (1 - crouchScale) * 24 * PLAYER_BASE_SCALE_Y

            // Flip based on facing direction (based on aim angle)
            const facingLeft = Math.abs(player.aimAngle) > Math.PI / 2
            playerSprite.scale.x = (facingLeft ? -1 : 1) * PLAYER_BASE_SCALE_X
        }

        if (!player.dead && weaponSprite) {
            const weaponIcon = getWeaponIcon(player.currentWeapon)
            if (weaponIcon) {
                const facingLeft = Math.abs(player.aimAngle) > Math.PI / 2
                weaponSprite.texture = weaponIcon
                weaponSprite.x = player.x
                weaponSprite.y = player.y
                weaponSprite.rotation = player.aimAngle
                weaponSprite.scale.x = WEAPON_IN_HAND_SCALE
                weaponSprite.scale.y = (facingLeft ? -1 : 1) * WEAPON_IN_HAND_SCALE
                weaponSprite.visible = true
            } else {
                weaponSprite.visible = false
            }
        } else if (weaponSprite) {
            weaponSprite.visible = false
        }

        if (!player.dead && playerCenterSprite) {
            playerCenterSprite.x = player.x
            playerCenterSprite.y = player.y
        }

        renderProjectiles()
        renderExplosions()
        renderRailShots()
        renderAimLine(player)
        updateHUD(player)

        app.render()
    },

    /**
     * Set player team color
     * @param {number} color - Hex color (0xff4444 for red, 0x4444ff for blue)
     */
    setPlayerColor(color) {
        if (playerSprite) {
            playerSprite.tint = color
        }
    },
}

const FRAME_MS = 16
const LOG_THROTTLE_MS = 50
const VELOCITY_Y_SPEED_JUMP = [0, 0, 0.4, 0.8, 1.0, 1.2, 1.4]
const VELOCITY_X_SPEED_JUMP = [0, 0.33, 0.8, 1.1, 1.4, 1.8, 2.2]

let time = 0
let logLine = 0
let lastLogTime = 0
let lastWasJump = false
let lastKeyUp = false
let speedJumpDirection = 0

function clampVelocity(player) {
    player.velocityX = Math.max(-5, Math.min(5, player.velocityX))
    player.velocityY = Math.max(-5, Math.min(5, player.velocityY))
}

function getSpeedX(player) {
    return player.velocityX !== 0
        ? Math.sign(player.velocityX) * VELOCITY_X_SPEED_JUMP[player.speedJump]
        : 0
}

function playerPhysics(player) {
    const startX = player.x
    const startY = player.y

    player.velocityY += 0.056
    if (player.velocityY > -1 && player.velocityY < 0) player.velocityY /= 1.11
    if (player.velocityY > 0 && player.velocityY < 5) player.velocityY *= 1.1

    if (Math.abs(player.velocityX) > 0.2) {
        if (player.keyLeft === player.keyRight) {
            player.velocityX /= player.isOnGround() ? 1.14 : 1.025
        }
    } else {
        player.velocityX = 0
    }

    const speedX = getSpeedX(player)
    player.setXY(player.x + player.velocityX + speedX, player.y + player.velocityY)

    if (player.crouch) {
        if (player.isOnGround() && (player.isBrickCrouchOnHead() || player.velocityY > 0)) {
            player.velocityY = 0
            player.setY(trunc(Math.round(player.y) / 16) * 16 + 8)
        } else if (player.isBrickCrouchOnHead() && player.velocityY < 0) {
            player.velocityY = 0
            player.doublejumpCountdown = 3
            player.setY(trunc(Math.round(player.y) / 16) * 16 + 8)
        }
    }

    if (player.velocityX !== 0) {
        const col = trunc(Math.round(startX + (player.velocityX < 0 ? -11 : 11)) / 32)
        const checkY = player.crouch ? player.y : startY
        const headOffset = player.crouch ? 8 : 16

        if (
            isBrick(col, trunc(Math.round(checkY - headOffset) / 16)) ||
            isBrick(col, trunc(Math.round(checkY) / 16)) ||
            isBrick(col, trunc(Math.round(checkY + 16) / 16))
        ) {
            player.setX(trunc(startX / 32) * 32 + (player.velocityX < 0 ? 9 : 22))
            player.velocityX = 0
            player.speedJump = 0
            if (startX !== player.x) log('wall', player)
        }
    }

    if (player.isOnGround() && (player.isBrickOnHead() || player.velocityY > 0)) {
        player.velocityY = 0
        player.setY(trunc(Math.round(player.y) / 16) * 16 + 8)
    } else if (player.isBrickOnHead() && player.velocityY < 0) {
        player.velocityY = 0
        player.doublejumpCountdown = 3
    }

    clampVelocity(player)
}

function playerMove(player) {
    playerPhysics(player)

    if (player.doublejumpCountdown > 0) player.doublejumpCountdown--
    if (player.isOnGround()) player.velocityY = 0

    let jumped = false

    if (
        player.speedJump > 0 &&
        (player.keyUp !== lastKeyUp ||
            (player.keyLeft && speedJumpDirection !== -1) ||
            (player.keyRight && speedJumpDirection !== 1))
    ) {
        player.speedJump = 0
        log('sj 0 - change keys', player)
    }

    lastKeyUp = player.keyUp

    if (player.keyUp) {
        if (player.isOnGround() && !player.isBrickOnHead() && !lastWasJump) {
            if (player.doublejumpCountdown > 4 && player.doublejumpCountdown < 11) {
                player.doublejumpCountdown = 14
                player.velocityY = -3

                const totalSpeedX =
                    player.velocityX !== 0
                        ? Math.abs(player.velocityX) + VELOCITY_X_SPEED_JUMP[player.speedJump]
                        : 0

                if (totalSpeedX > 3) {
                    const bonus = totalSpeedX - 3
                    player.velocityY -= bonus
                    log(`dj higher (bonus +${formatNum(bonus)})`, player)
                } else {
                    log('dj standard', player)
                }
                player.crouch = false
                Sound.jump()
            } else {
                if (player.doublejumpCountdown === 0) {
                    player.doublejumpCountdown = 14
                    Sound.jump()
                }
                player.velocityY = -2.9 + VELOCITY_Y_SPEED_JUMP[player.speedJump]
                log('jump', player)

                if (player.speedJump < 6 && !lastWasJump && player.keyLeft !== player.keyRight) {
                    speedJumpDirection = player.keyLeft ? -1 : 1
                    player.speedJump++
                    log('increase sj', player)
                }
            }
            jumped = true
        }
    } else if (player.isOnGround() && player.speedJump > 0 && !player.keyDown) {
        player.speedJump = 0
        log('sj 0 - on ground', player)
    }

    if (!player.keyUp && player.keyDown) {
        player.crouch = player.isOnGround() || player.isBrickCrouchOnHead()
    } else {
        player.crouch = player.isOnGround() && player.isBrickCrouchOnHead()
    }

    lastWasJump = jumped

    if (player.keyLeft !== player.keyRight) {
        let maxVelX = PLAYER_MAX_VELOCITY_X
        if (player.crouch) maxVelX--

        const sign = player.keyLeft ? -1 : 1
        if (player.velocityX * sign < 0) player.velocityX += sign * 0.8

        const absVelX = Math.abs(player.velocityX)
        if (absVelX < maxVelX) {
            player.velocityX += sign * 0.35
        } else if (absVelX > maxVelX) {
            player.velocityX = sign * maxVelX
        }
    }
}

function log(text, player) {
    const now = performance.now()
    if (now - lastLogTime < LOG_THROTTLE_MS) return
    lastLogTime = now
    logLine++

    const dx = getSpeedX(player)
    Console.writeText(
        `${logLine} ${text} (x:${formatNum(player.x)} y:${formatNum(player.y)} ` +
            `dx:${formatNum(dx)} dy:${formatNum(player.velocityY)} sj:${player.speedJump})`,
    )
}

function formatNum(val) {
    const i = trunc(val)
    return `${i}.${Math.abs(trunc(val * 10) - i * 10)}`
}

export const Physics = {
    updateGame(player, timestamp) {
        if (time === 0) time = timestamp - FRAME_MS

        const delta = timestamp - time
        let frames = trunc(delta / FRAME_MS)
        if (frames === 0) return false

        time += frames * FRAME_MS
        while (frames-- > 0) playerMove(player)
    },
}
