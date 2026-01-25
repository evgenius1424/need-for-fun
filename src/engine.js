import * as PIXI from 'pixi.js'
import { Console, Constants, Sound, Utils, WeaponConstants, WeaponId } from './helpers'
import { Map } from './map'
import { Projectiles } from './projectiles'
import {
    getTexture,
    getProjectileTexture,
    getWeaponIcon,
    getItemIcon,
    getModelAnimationFrames,
    ensureModelLoaded,
} from './assets'
import { DEFAULT_MODEL, DEFAULT_SKIN } from './models'

const { BRICK_WIDTH, BRICK_HEIGHT, PLAYER_MAX_VELOCITY_X } = Constants
const { trunc } = Utils
const { isBrick } = Map

const PLAYER_SCALE_X = BRICK_WIDTH / 48
const PLAYER_SCALE_Y = 1
const WEAPON_SCALE = 0.85
const BG_TILE_SCALE = 0.7
const FRAME_MS = 16

const ANIMATION = {
    walk: { refresh: 2, loop: true },
    crouch: { refresh: 3, loop: true },
    die: { refresh: 2, loop: false },
}

const PROJECTILE_COLORS = {
    rocket: 0xff6600,
    plasma: 0x00ffff,
    grenade: 0x666666,
    bfg: 0x00ff00,
}

const ROCKET_SMOKE_INTERVAL = 4
const GRENADE_SMOKE_INTERVAL = 6
const SMOKE_MAX_AGE = 32

const WEAPON_ITEM_MAP = {
    weapon_machine: WeaponId.MACHINE,
    weapon_shotgun: WeaponId.SHOTGUN,
    weapon_grenade: WeaponId.GRENADE,
    weapon_rocket: WeaponId.ROCKET,
}

const SPEED_JUMP_Y = [0, 0, 0.4, 0.8, 1.0, 1.2, 1.4]
const SPEED_JUMP_X = [0, 0.33, 0.8, 1.1, 1.4, 1.8, 2.2]

const app = await initApp()
const { renderer, stage } = app

const world = new PIXI.Container()
stage.addChild(world)
stage.visible = false

let bgSprite = null
const tiles = new PIXI.Container()
const smokeLayer = new PIXI.Container()
const items = new PIXI.Container()
const projectiles = new PIXI.Container()
const explosionsLayer = new PIXI.Container()
const aimLine = new PIXI.Graphics()
const railLines = new PIXI.Graphics()
const shaftLines = new PIXI.Graphics()
const bulletImpacts = new PIXI.Graphics()
const gauntletSparks = new PIXI.Graphics()

world.addChild(tiles)
world.addChild(smokeLayer)
world.addChild(projectiles)
world.addChild(items)
world.addChild(explosionsLayer)
world.addChild(aimLine)
world.addChild(railLines)
world.addChild(shaftLines)
world.addChild(bulletImpacts)
world.addChild(gauntletSparks)

const projectilePool = []
const smokePool = []
const explosionPool = []
const itemSprites = []
const explosions = []
const smokePuffs = []
const railShots = []
const shaftShots = []
const bulletHits = []
const gauntletHits = []

let playerSprite = null
let playerCenter = null
let weaponSprite = null
let currentAnim = 'walk'
let animFrame = 0
let animTimer = 0

const botSprites = []

function createBotSprite(model, skin) {
    const walkFrames = getModelAnimationFrames(model, skin, 'walk')
    if (walkFrames.length === 0) return null

    const sprite = new PIXI.Sprite(walkFrames[0])
    sprite.anchor.set(0.5)
    sprite.scale.set(PLAYER_SCALE_X, PLAYER_SCALE_Y)
    world.addChild(sprite)

    const weapon = new PIXI.Sprite()
    weapon.anchor.set(0.5)
    weapon.scale.set(WEAPON_SCALE)
    world.addChild(weapon)

    return {
        sprite,
        weapon,
        anim: 'walk',
        frame: 0,
        timer: 0,
        model,
        skin,
    }
}

function ensureBotSprite(bot) {
    const { player } = bot
    const existingIndex = botSprites.findIndex((bs) => bs.botId === player.id)

    if (existingIndex !== -1) {
        const existing = botSprites[existingIndex]
        if (existing.model === player.model && existing.skin === player.skin) {
            return existing
        }
        // Model/skin changed - destroy old sprites and remove from array
        existing.sprite.destroy()
        existing.weapon.destroy()
        botSprites.splice(existingIndex, 1)
    }

    const botData = createBotSprite(player.model, player.skin)
    if (botData) {
        botData.botId = player.id
        botSprites.push(botData)
    }
    return botData
}

const hud = createHUD()
stage.addChild(hud.container)

const camera = { float: false, halfW: 0, halfH: 0, dx: 0, dy: 0, scale: 1 }

Projectiles.onExplosion((x, y, type) => {
    const radius = type === 'rocket' || type === 'grenade' || type === 'bfg' ? 40 : 15
    explosions.push({
        x,
        y,
        radius,
        maxRadius: radius,
        age: 0,
        maxAge: 15,
        color: PROJECTILE_COLORS[type] ?? 0xff6600,
    })
})

addEventListener('resize', recalcCamera)

export const Render = {
    initSprites(player) {
        const bgTex = getTexture('background')
        if (bgTex) {
            bgSprite = new PIXI.TilingSprite({
                texture: bgTex,
                width: innerWidth,
                height: innerHeight,
            })
            bgSprite.tileScale.set(BG_TILE_SCALE)
            world.addChildAt(bgSprite, 0)
        }

        const model = player?.model ?? DEFAULT_MODEL
        const skin = player?.skin ?? DEFAULT_SKIN
        const walkFrames = getModelAnimationFrames(model, skin, 'walk')
        if (walkFrames.length > 0) {
            playerSprite = new PIXI.Sprite(walkFrames[0])
            playerSprite.anchor.set(0.5)
            playerSprite.scale.set(PLAYER_SCALE_X, PLAYER_SCALE_Y)
            playerSprite.model = model
            playerSprite.skin = skin
            world.addChild(playerSprite)

            playerCenter = new PIXI.Graphics()
            playerCenter.rect(-1, -1, 2, 2).fill(0x0000aa)
            world.addChild(playerCenter)
        }

        weaponSprite = new PIXI.Sprite()
        weaponSprite.anchor.set(0.5)
        weaponSprite.scale.set(WEAPON_SCALE)
        world.addChild(weaponSprite)
    },

    setSceneReady(visible) {
        stage.visible = visible
        hud.container.visible = visible
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

    addShaftShot(shot) {
        shaftShots.push({
            x1: shot.startX,
            y1: shot.startY,
            x2: shot.trace.x,
            y2: shot.trace.y,
            age: 0,
            maxAge: 6,
        })
    },

    addBulletImpact(hitX, hitY, options = {}) {
        bulletHits.push({
            x: hitX,
            y: hitY,
            age: 0,
            maxAge: options.maxAge ?? 12,
            radius: options.radius ?? 2.5,
            color: options.color ?? 0xffd24a,
            alpha: options.alpha ?? 0.9,
        })
    },

    addGauntletSpark(hitX, hitY, options = {}) {
        gauntletHits.push({
            x: hitX,
            y: hitY,
            age: 0,
            maxAge: options.maxAge ?? 6,
            radius: options.radius ?? 5,
            color: options.color ?? 0x6ff2ff,
            alpha: options.alpha ?? 0.9,
        })
    },

    renderMap() {
        tiles.removeChildren()
        items.removeChildren()
        itemSprites.length = 0

        const rows = Map.getRows()
        const cols = Map.getCols()
        const brickTex = getTexture('brick')

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (!isBrick(col, row)) continue
                const sprite = new PIXI.Sprite(brickTex)
                sprite.x = col * BRICK_WIDTH
                sprite.y = row * BRICK_HEIGHT
                const tint = Map.getTileColor?.(col, row)
                if (tint) sprite.tint = tint
                tiles.addChild(sprite)
            }
        }

        for (const item of Map.getItems()) {
            const tex = item.type.startsWith('weapon_')
                ? getWeaponIcon(WEAPON_ITEM_MAP[item.type])
                : getItemIcon(item.type)
            if (!tex) continue

            const sprite = new PIXI.Sprite(tex)
            const scale = (BRICK_HEIGHT * 1.2) / Math.max(tex.width, tex.height)
            sprite.anchor.set(0.5)
            sprite.scale.set(scale)
            sprite.x = item.col * BRICK_WIDTH + BRICK_WIDTH / 2
            sprite.y = item.row * BRICK_HEIGHT + BRICK_HEIGHT / 2
            sprite.visible = item.active
            itemSprites.push({ item, sprite })
            items.addChild(sprite)
        }

        app.render()
        recalcCamera()
    },

    renderGame(player, bots = []) {
        updateCamera(player)
        updatePlayerSprite(player)
        updateWeaponSprite(player)
        updateBotSprites(bots)
        updateItemSprites()
        renderSmoke()
        renderProjectiles()
        renderExplosions()
        renderRailShots()
        renderShaftShots()
        renderBulletImpacts()
        renderGauntletSparks()
        renderAimLine(player)
        updateHUD(player)
        app.render()
    },

    setPlayerColor(color) {
        if (playerSprite) playerSprite.tint = color
    },

    cleanupBotSprite(playerId) {
        const index = botSprites.findIndex((bs) => bs.botId === playerId)
        if (index !== -1) {
            const botData = botSprites[index]
            botData.sprite.destroy()
            botData.weapon.destroy()
            botSprites.splice(index, 1)
        }
    },
}

const physics = {
    time: 0,
    lastKeyUp: false,
    lastWasJump: false,
    speedJumpDir: 0,
    logLine: 0,
    lastLogTime: 0,
}

export const Physics = {
    // Update all players with synchronized physics frames
    updateAllPlayers(players, timestamp) {
        if (physics.time === 0) physics.time = timestamp - FRAME_MS

        const delta = timestamp - physics.time
        let frames = trunc(delta / FRAME_MS)
        if (frames === 0) return false

        physics.time += frames * FRAME_MS

        // Apply same number of physics frames to ALL players
        while (frames-- > 0) {
            for (const player of players) {
                if (!player.dead) {
                    playerMove(player)
                }
            }
        }
        return true
    },

    // Legacy single player update (kept for compatibility)
    updateGame(player, timestamp) {
        if (physics.time === 0) physics.time = timestamp - FRAME_MS

        const delta = timestamp - physics.time
        let frames = trunc(delta / FRAME_MS)
        if (frames === 0) return false

        physics.time += frames * FRAME_MS
        while (frames-- > 0) playerMove(player)
        return true
    },
}

async function initApp() {
    const app = new PIXI.Application()
    try {
        await app.init({
            width: innerWidth,
            height: innerHeight,
            background: 0x262626,
            preference: 'webgl',
            autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2),
        })
    } catch (err) {
        Console.writeText(`renderer init failed: ${err?.message ?? err}`)
        throw err
    }
    app.canvas.style.display = 'block'
    document.getElementById('game').appendChild(app.canvas)
    return app
}

function createHUD() {
    const container = new PIXI.Container()

    const health = new PIXI.Text({
        text: '100',
        style: {
            fontFamily: 'Arial',
            fontSize: 32,
            fontWeight: 'bold',
            fill: 0x00ff00,
            stroke: { color: 0x000000, width: 3 },
        },
    })
    health.x = 20

    const armor = new PIXI.Text({
        text: '0',
        style: {
            fontFamily: 'Arial',
            fontSize: 24,
            fontWeight: 'bold',
            fill: 0xffff00,
            stroke: { color: 0x000000, width: 2 },
        },
    })
    armor.x = 20

    const weapon = new PIXI.Text({
        text: 'Machinegun',
        style: {
            fontFamily: 'Arial',
            fontSize: 20,
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 2 },
        },
    })
    weapon.anchor.set(1, 0)

    const ammo = new PIXI.Text({
        text: '100',
        style: {
            fontFamily: 'Arial',
            fontSize: 28,
            fontWeight: 'bold',
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 2 },
        },
    })
    ammo.anchor.set(1, 0)

    container.addChild(health, armor, weapon, ammo)
    return { container, health, armor, weapon, ammo }
}

function recalcCamera() {
    renderer.resize(innerWidth - 20, innerHeight)
    const mapW = Map.getCols() * BRICK_WIDTH
    const mapH = Map.getRows() * BRICK_HEIGHT
    camera.float = mapH > innerHeight || mapW > innerWidth - 20

    if (camera.float) {
        camera.halfW = ((innerWidth - 20) / 2) | 0
        camera.halfH = (innerHeight / 2) | 0
        camera.scale = 1
    } else {
        camera.scale = Math.min((innerWidth - 20) / mapW, innerHeight / mapH, 1.6)
        camera.dx = ((innerWidth - 20 - mapW * camera.scale) / 2) | 0
        camera.dy = ((innerHeight - mapH * camera.scale) / 2) | 0
    }

    world.scale.set(camera.scale)

    if (bgSprite) {
        bgSprite.width = innerWidth
        bgSprite.height = innerHeight
    }

    hud.health.y = innerHeight - 50
    hud.armor.y = innerHeight - 80
    hud.weapon.x = innerWidth - 40
    hud.weapon.y = innerHeight - 50
    hud.ammo.x = innerWidth - 40
    hud.ammo.y = innerHeight - 80
}

function updateCamera(player) {
    if (camera.float) {
        world.x = camera.halfW - player.x
        world.y = camera.halfH - player.y
        if (bgSprite) {
            bgSprite.tilePosition.x = -player.x * 0.3
            bgSprite.tilePosition.y = -player.y * 0.3
            bgSprite.x = player.x - camera.halfW
            bgSprite.y = player.y - camera.halfH
        }
    } else {
        world.x = camera.dx
        world.y = camera.dy
        if (bgSprite) {
            bgSprite.x = -camera.dx
            bgSprite.y = -camera.dy
        }
    }
}

function updatePlayerSprite(player) {
    if (!playerSprite) return

    const targetAnim = player.dead ? 'die' : player.crouch ? 'crouch' : 'walk'
    if (targetAnim !== currentAnim) {
        currentAnim = targetAnim
        animFrame = 0
        animTimer = 0
    }

    const frames = getModelAnimationFrames(player.model, player.skin, currentAnim)
    const cfg = ANIMATION[currentAnim]
    const isMoving = player.keyLeft !== player.keyRight || player.velocityX !== 0

    if (frames.length > 1 && ++animTimer >= cfg.refresh) {
        animTimer = 0
        if (cfg.loop) {
            if (isMoving || currentAnim === 'crouch') animFrame = (animFrame + 1) % frames.length
        } else if (animFrame < frames.length - 1) {
            animFrame++
        }
    }

    if (frames[animFrame]) playerSprite.texture = frames[animFrame]

    playerSprite.x = player.x
    playerSprite.visible = true
    playerSprite.scale.x = (player.facingLeft ? -1 : 1) * PLAYER_SCALE_X

    if (player.crouch) {
        playerSprite.scale.y = PLAYER_SCALE_Y * 0.83
        playerSprite.y = player.y + 8
    } else {
        playerSprite.scale.y = PLAYER_SCALE_Y
        playerSprite.y = player.y
    }

    if (playerCenter) {
        playerCenter.visible = !player.dead
        playerCenter.x = player.x
        playerCenter.y = player.y
    }
}

function updateWeaponSprite(player) {
    if (!weaponSprite) return

    if (player.dead) {
        weaponSprite.visible = false
        return
    }

    const icon = getWeaponIcon(player.currentWeapon)
    if (!icon) {
        weaponSprite.visible = false
        return
    }

    weaponSprite.texture = icon
    weaponSprite.x = player.x
    weaponSprite.y = player.crouch ? player.y + 4 : player.y
    weaponSprite.rotation = player.aimAngle
    weaponSprite.scale.x = WEAPON_SCALE
    weaponSprite.scale.y = (player.facingLeft ? -1 : 1) * WEAPON_SCALE
    weaponSprite.visible = true
}

function updateBotSprites(bots) {
    // Hide all existing bot sprites first
    for (const botData of botSprites) {
        botData.sprite.visible = false
        botData.weapon.visible = false
    }

    for (const bot of bots) {
        if (!bot) continue

        const botData = ensureBotSprite(bot)
        if (!botData) continue

        const player = bot.player

        // Update animation
        const targetAnim = player.dead ? 'die' : player.crouch ? 'crouch' : 'walk'
        if (targetAnim !== botData.anim) {
            botData.anim = targetAnim
            botData.frame = 0
            botData.timer = 0
        }

        const frames = getModelAnimationFrames(player.model, player.skin, botData.anim)
        const cfg = ANIMATION[botData.anim]
        const isMoving = player.keyLeft !== player.keyRight || player.velocityX !== 0

        if (frames.length > 1 && ++botData.timer >= cfg.refresh) {
            botData.timer = 0
            if (cfg.loop) {
                if (isMoving || botData.anim === 'crouch') {
                    botData.frame = (botData.frame + 1) % frames.length
                }
            } else if (botData.frame < frames.length - 1) {
                botData.frame++
            }
        }

        if (frames[botData.frame]) {
            botData.sprite.texture = frames[botData.frame]
        }

        // Update sprite position
        botData.sprite.x = player.x
        botData.sprite.visible = true
        botData.sprite.scale.x = (player.facingLeft ? -1 : 1) * PLAYER_SCALE_X

        if (player.crouch) {
            botData.sprite.scale.y = PLAYER_SCALE_Y * 0.83
            botData.sprite.y = player.y + 8
        } else {
            botData.sprite.scale.y = PLAYER_SCALE_Y
            botData.sprite.y = player.y
        }

        // Update weapon sprite
        if (player.dead) {
            botData.weapon.visible = false
        } else {
            const icon = getWeaponIcon(player.currentWeapon)
            if (icon) {
                botData.weapon.texture = icon
                botData.weapon.x = player.x
                botData.weapon.y = player.crouch ? player.y + 8 : player.y
                botData.weapon.rotation = player.aimAngle
                botData.weapon.scale.x = WEAPON_SCALE
                botData.weapon.scale.y = (player.facingLeft ? -1 : 1) * WEAPON_SCALE
                botData.weapon.visible = true
            } else {
                botData.weapon.visible = false
            }
        }
    }
}

function updateItemSprites() {
    for (const { item, sprite } of itemSprites) {
        sprite.visible = item.active
    }
}

function updateHUD(player) {
    const hp = Math.max(0, player.health)
    hud.health.text = hp.toString()
    hud.health.style.fill = hp > 100 ? 0x00aaff : hp > 50 ? 0x00ff00 : hp > 25 ? 0xffff00 : 0xff0000

    hud.armor.text = player.armor.toString()
    hud.armor.visible = player.armor > 0

    hud.weapon.text = WeaponConstants.NAMES[player.currentWeapon]

    const ammo = player.ammo[player.currentWeapon]
    hud.ammo.text = ammo === -1 ? '∞' : ammo.toString()
}

function poolGet(pool, container, createFn) {
    for (const sprite of pool) {
        if (!sprite.visible) {
            sprite.visible = true
            return sprite
        }
    }
    const sprite = createFn()
    pool.push(sprite)
    container.addChild(sprite)
    return sprite
}

function addSmokePuff(
    proj,
    {
        grayMin = 215,
        grayMax = 250,
        upMin = -0.15,
        upMax = -0.4,
        baseScaleMin = 0.4,
        baseScaleMax = 0.8,
        maxAge = SMOKE_MAX_AGE,
        backOffsetMin = 10,
        backOffsetMax = 14,
        alpha = 0.6,
    } = {},
) {
    const speed = Math.hypot(proj.velocityX, proj.velocityY)
    const nx = speed > 0.01 ? proj.velocityX / speed : 1
    const ny = speed > 0.01 ? proj.velocityY / speed : 0
    const backOffset = backOffsetMin + Math.random() * (backOffsetMax - backOffsetMin)
    const spread = 3
    const gray = grayMin + Math.floor(Math.random() * (grayMax - grayMin))

    smokePuffs.push({
        x: proj.x - nx * backOffset + (Math.random() - 0.5) * spread,
        y: proj.y - ny * backOffset + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.4,
        vy: upMin + Math.random() * (upMax - upMin),
        age: 0,
        maxAge: maxAge + Math.floor(Math.random() * 10),
        baseScale: baseScaleMin + Math.random() * (baseScaleMax - baseScaleMin),
        alpha,
        tint: (gray << 16) + (gray << 8) + gray,
    })
}

function renderSmoke() {
    for (const s of smokePool) s.visible = false

    for (let i = smokePuffs.length - 1; i >= 0; i--) {
        const puff = smokePuffs[i]
        puff.age++
        if (puff.age > puff.maxAge) {
            smokePuffs.splice(i, 1)
            continue
        }

        puff.x += puff.vx
        puff.y += puff.vy

        const progress = puff.age / puff.maxAge
        const sprite = poolGet(smokePool, smokeLayer, () => {
            const s = new PIXI.Sprite(getTexture('smoke'))
            s.anchor.set(0.5)
            return s
        })
        sprite.x = puff.x
        sprite.y = puff.y
        sprite.scale.set(puff.baseScale * (1 + progress * 1.4))
        sprite.alpha = (1 - progress) * puff.alpha
        sprite.tint = puff.tint
    }
}

function renderProjectiles() {
    for (const s of projectilePool) s.visible = false

    for (const proj of Projectiles.getAll()) {
        if (!proj.active) continue
        if (proj.type === 'rocket' && proj.age % ROCKET_SMOKE_INTERVAL === 0) {
            addSmokePuff(proj)
        }
        if (proj.type === 'grenade' && proj.age % GRENADE_SMOKE_INTERVAL === 0) {
            addSmokePuff(proj, {
                grayMin: 180,
                grayMax: 220,
                upMin: -0.05,
                upMax: -0.2,
                baseScaleMin: 0.3,
                baseScaleMax: 0.55,
                maxAge: 28,
                backOffsetMin: 6,
                backOffsetMax: 10,
                alpha: 0.5,
            })
        }
        const sprite = poolGet(projectilePool, projectiles, () => {
            const s = new PIXI.Sprite(getProjectileTexture(proj.type))
            s.anchor.set(0.5)
            return s
        })
        sprite.texture = getProjectileTexture(proj.type)
        sprite.x = proj.x
        sprite.y = proj.y
        sprite.rotation = Math.atan2(proj.velocityY, proj.velocityX)
        sprite.tint = PROJECTILE_COLORS[proj.type] ?? 0xffffff
    }
}

function renderExplosions() {
    for (const s of explosionPool) s.visible = false

    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i]
        if (++exp.age > exp.maxAge) {
            explosions.splice(i, 1)
            continue
        }
        const progress = exp.age / exp.maxAge
        const sprite = poolGet(explosionPool, explosionsLayer, () => {
            const s = new PIXI.Sprite(getTexture('explosion'))
            s.anchor.set(0.5)
            return s
        })
        sprite.x = exp.x
        sprite.y = exp.y
        sprite.scale.set((1 + progress) * (exp.radius / 16))
        sprite.alpha = 1 - progress
        sprite.tint = exp.color
    }
}

function renderRailShots() {
    railLines.clear()

    for (let i = railShots.length - 1; i >= 0; i--) {
        const shot = railShots[i]
        if (++shot.age > shot.maxAge) {
            railShots.splice(i, 1)
            continue
        }
        const alpha = 1 - shot.age / shot.maxAge
        const dx = shot.x2 - shot.x1
        const dy = shot.y2 - shot.y1
        const len = Math.hypot(dx, dy) || 1
        const nx = (-dy / len) * (1.5 + Math.random() * 1.5)
        const ny = (dx / len) * (1.5 + Math.random() * 1.5)

        railLines
            .moveTo(shot.x1, shot.y1)
            .lineTo(shot.x2, shot.y2)
            .stroke({ width: 6, color: 0x66ddff, alpha: alpha * 0.35 })
        railLines
            .moveTo(shot.x1 + nx, shot.y1 + ny)
            .lineTo(shot.x2 + nx, shot.y2 + ny)
            .stroke({ width: 3, color: 0x9ff0ff, alpha: alpha * 0.55 })
        railLines
            .moveTo(shot.x1, shot.y1)
            .lineTo(shot.x2, shot.y2)
            .stroke({ width: 2, color: 0xffffff, alpha })
        railLines.circle(shot.x2, shot.y2, 6).fill({ color: 0x9ff0ff, alpha: alpha * 0.6 })
    }
}

function renderShaftShots() {
    shaftLines.clear()

    for (let i = shaftShots.length - 1; i >= 0; i--) {
        const shot = shaftShots[i]
        if (++shot.age > shot.maxAge) {
            shaftShots.splice(i, 1)
            continue
        }
        const alpha = 1 - shot.age / shot.maxAge
        const dx = shot.x2 - shot.x1
        const dy = shot.y2 - shot.y1
        const len = Math.hypot(dx, dy) || 1
        const jitter = (Math.random() - 0.5) * 2.5
        const nx = (-dy / len) * jitter
        const ny = (dx / len) * jitter

        shaftLines
            .moveTo(shot.x1, shot.y1)
            .lineTo(shot.x2, shot.y2)
            .stroke({ width: 8, color: 0x2b6cff, alpha: alpha * 0.25 })
        shaftLines
            .moveTo(shot.x1 + nx, shot.y1 + ny)
            .lineTo(shot.x2 + nx, shot.y2 + ny)
            .stroke({ width: 4, color: 0x45c8ff, alpha: alpha * 0.65 })
        shaftLines
            .moveTo(shot.x1, shot.y1)
            .lineTo(shot.x2, shot.y2)
            .stroke({ width: 2, color: 0xe8fbff, alpha })
    }
}

function renderBulletImpacts() {
    bulletImpacts.clear()

    for (let i = bulletHits.length - 1; i >= 0; i--) {
        const hit = bulletHits[i]
        if (++hit.age > hit.maxAge) {
            bulletHits.splice(i, 1)
            continue
        }
        const alpha = (1 - hit.age / hit.maxAge) * hit.alpha
        const outer = hit.radius * 2
        bulletImpacts.circle(hit.x, hit.y, outer).fill({ color: 0xc08900, alpha: alpha * 0.4 })
        bulletImpacts.circle(hit.x, hit.y, hit.radius).fill({ color: hit.color, alpha })
    }
}

function renderGauntletSparks() {
    gauntletSparks.clear()

    for (let i = gauntletHits.length - 1; i >= 0; i--) {
        const hit = gauntletHits[i]
        if (++hit.age > hit.maxAge) {
            gauntletHits.splice(i, 1)
            continue
        }
        const alpha = (1 - hit.age / hit.maxAge) * hit.alpha
        const jitter = hit.radius * 0.55

        for (let j = 0; j < 8; j++) {
            const angle = Math.random() * Math.PI * 2
            const dist = hit.radius * (0.4 + Math.random() * 0.7)
            const x1 = hit.x + Math.cos(angle) * dist
            const y1 = hit.y + Math.sin(angle) * dist
            const x2 = x1 + (Math.random() - 0.5) * jitter
            const y2 = y1 + (Math.random() - 0.5) * jitter
            gauntletSparks
                .moveTo(hit.x, hit.y)
                .lineTo(x1, y1)
                .stroke({ width: 2, color: hit.color, alpha: alpha * 0.7 })
            gauntletSparks
                .moveTo(x1, y1)
                .lineTo(x2, y2)
                .stroke({ width: 1, color: 0xffffff, alpha })
        }
    }
}

function renderAimLine(player) {
    aimLine.clear()
    if (!player || player.dead) return

    const originX = player.x
    const originY = player.crouch ? player.y + 4 : player.y
    const dist = BRICK_WIDTH * 2.6
    const half = Math.max(2, BRICK_WIDTH * 0.1)
    const x = originX + Math.cos(player.aimAngle) * dist
    const y = originY + Math.sin(player.aimAngle) * dist

    aimLine
        .moveTo(x - half, y)
        .lineTo(x + half, y)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.7 })
    aimLine
        .moveTo(x, y - half)
        .lineTo(x, y + half)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.7 })
}

function playerMove(player) {
    applyPhysics(player)

    if (player.doublejumpCountdown > 0) player.doublejumpCountdown--
    if (player.isOnGround()) player.velocityY = 0

    handleJump(player)
    handleCrouch(player)
    handleHorizontalMovement(player)
}

function applyPhysics(player) {
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
            player.setY(
                trunc(Math.round(player.y) / BRICK_HEIGHT) * BRICK_HEIGHT + BRICK_HEIGHT / 2,
            )
        } else if (player.isBrickCrouchOnHead() && player.velocityY < 0) {
            player.velocityY = 0
            player.doublejumpCountdown = 3
            player.setY(
                trunc(Math.round(player.y) / BRICK_HEIGHT) * BRICK_HEIGHT + BRICK_HEIGHT / 2,
            )
        }
    }

    if (player.velocityX !== 0) {
        const col = trunc(Math.round(startX + (player.velocityX < 0 ? -11 : 11)) / BRICK_WIDTH)
        const checkY = player.crouch ? player.y : startY
        const headOff = player.crouch ? 8 : 16

        if (
            isBrick(col, trunc(Math.round(checkY - headOff) / BRICK_HEIGHT)) ||
            isBrick(col, trunc(Math.round(checkY) / BRICK_HEIGHT)) ||
            isBrick(col, trunc(Math.round(checkY + BRICK_HEIGHT) / BRICK_HEIGHT))
        ) {
            player.setX(trunc(startX / BRICK_WIDTH) * BRICK_WIDTH + (player.velocityX < 0 ? 9 : 22))
            player.velocityX = 0
            player.speedJump = 0
            if (startX !== player.x) logPhysics('wall', player)
        }
    }

    if (player.isOnGround() && (player.isBrickOnHead() || player.velocityY > 0)) {
        player.velocityY = 0
        player.setY(trunc(Math.round(player.y) / BRICK_HEIGHT) * BRICK_HEIGHT + BRICK_HEIGHT / 2)
    } else if (player.isBrickOnHead() && player.velocityY < 0) {
        player.velocityY = 0
        player.doublejumpCountdown = 3
    }

    player.velocityX = clamp(player.velocityX, -5, 5)
    player.velocityY = clamp(player.velocityY, -5, 5)
}

function handleJump(player) {
    const keysChanged =
        player.keyUp !== physics.lastKeyUp ||
        (player.keyLeft && physics.speedJumpDir !== -1) ||
        (player.keyRight && physics.speedJumpDir !== 1)

    if (player.speedJump > 0 && keysChanged) {
        player.speedJump = 0
        logPhysics('sj 0 - change keys', player)
    }

    physics.lastKeyUp = player.keyUp
    let jumped = false

    if (player.keyUp && player.isOnGround() && !player.isBrickOnHead() && !physics.lastWasJump) {
        const isDoubleJump = player.doublejumpCountdown > 4 && player.doublejumpCountdown < 11

        if (isDoubleJump) {
            player.doublejumpCountdown = 14
            player.velocityY = -3

            const totalSpeedX =
                player.velocityX !== 0
                    ? Math.abs(player.velocityX) + SPEED_JUMP_X[player.speedJump]
                    : 0

            if (totalSpeedX > 3) {
                const bonus = totalSpeedX - 3
                player.velocityY -= bonus
                logPhysics(`dj higher (bonus +${formatNum(bonus)})`, player)
            } else {
                logPhysics('dj standard', player)
            }
            player.crouch = false
            Sound.jump(player.model)
        } else {
            if (player.doublejumpCountdown === 0) {
                player.doublejumpCountdown = 14
                Sound.jump(player.model)
            }
            player.velocityY = -2.9 + SPEED_JUMP_Y[player.speedJump]
            logPhysics('jump', player)

            if (
                player.speedJump < 6 &&
                !physics.lastWasJump &&
                player.keyLeft !== player.keyRight
            ) {
                physics.speedJumpDir = player.keyLeft ? -1 : 1
                player.speedJump++
                logPhysics('increase sj', player)
            }
        }
        jumped = true
    } else if (player.isOnGround() && player.speedJump > 0 && !player.keyDown) {
        player.speedJump = 0
        logPhysics('sj 0 - on ground', player)
    }

    physics.lastWasJump = jumped
}

function handleCrouch(player) {
    if (!player.keyUp && player.keyDown) {
        player.crouch = player.isOnGround() || player.isBrickCrouchOnHead()
    } else {
        player.crouch = player.isOnGround() && player.isBrickCrouchOnHead()
    }
}

function handleHorizontalMovement(player) {
    if (player.keyLeft === player.keyRight) return

    let maxVel = PLAYER_MAX_VELOCITY_X
    if (player.crouch) maxVel--

    const sign = player.keyLeft ? -1 : 1
    if (player.velocityX * sign < 0) player.velocityX += sign * 0.8

    const absVel = Math.abs(player.velocityX)
    if (absVel < maxVel) {
        player.velocityX += sign * 0.35
    } else if (absVel > maxVel) {
        player.velocityX = sign * maxVel
    }
}

function getSpeedX(player) {
    return player.velocityX !== 0 ? Math.sign(player.velocityX) * SPEED_JUMP_X[player.speedJump] : 0
}

function logPhysics(text, player) {
    const now = performance.now()
    if (now - physics.lastLogTime < 50) return
    physics.lastLogTime = now
    physics.logLine++

    const dx = getSpeedX(player)
    Console.writeText(
        `${physics.logLine} ${text} (x:${formatNum(player.x)} y:${formatNum(player.y)} ` +
            `dx:${formatNum(dx)} dy:${formatNum(player.velocityY)} sj:${player.speedJump})`,
    )
}

function formatNum(val) {
    const i = trunc(val)
    return `${i}.${Math.abs(trunc(val * 10) - i * 10)}`
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}
