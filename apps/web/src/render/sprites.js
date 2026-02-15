import * as PIXI from 'pixi.js'
import { getModelAnimationFrames, getWeaponIcon } from './assets'
import { DEFAULT_MODEL, DEFAULT_SKIN } from '../core/models'
import { getRenderPosition } from './camera'
import { world } from './app'
import { ANIMATION, PLAYER_SCALE_X, PLAYER_SCALE_Y, WEAPON_SCALE } from './constants'

const CROUCH_SCALE_FACTOR = 0.83
const CROUCH_Y_OFFSET = 8
const CROUCH_WEAPON_Y_OFFSET = 4

let localPlayer = { sprite: null, center: null, weapon: null, anim: 'walk', frame: 0, timer: 0 }
const botSprites = new Map()

export function initPlayerSprites(player) {
    const model = player?.model ?? DEFAULT_MODEL
    const skin = player?.skin ?? DEFAULT_SKIN

    localPlayer.sprite = createPlayerSprite(model, skin)
    if (!localPlayer.sprite) return

    localPlayer.center = new PIXI.Graphics()
    localPlayer.center.beginFill(0x0000aa)
    localPlayer.center.drawRect(-1, -1, 2, 2)
    localPlayer.center.endFill()
    world.addChild(localPlayer.center)

    localPlayer.weapon = createWeaponSprite()
}

export function setPlayerColor(color) {
    if (localPlayer.sprite) localPlayer.sprite.tint = color
}

export function updatePlayerSprite(player) {
    if (!localPlayer.sprite) return

    updateAnimationState(localPlayer, player)
    applyPlayerTexture(localPlayer, player)

    const { x, y } = getRenderPosition(player)
    positionSprite(localPlayer.sprite, player, x, y)
    localPlayer.sprite.visible = true

    if (localPlayer.center) {
        localPlayer.center.visible = !player.dead
        localPlayer.center.x = x
        localPlayer.center.y = y
    }
}

export function updateWeaponSprite(player) {
    if (!localPlayer.weapon) return

    if (player.dead) {
        localPlayer.weapon.visible = false
        return
    }

    const { x, y, aimAngle } = getRenderPosition(player)
    const yOffset = player.crouch ? CROUCH_WEAPON_Y_OFFSET : 0
    positionWeapon(localPlayer.weapon, player, x, y + yOffset, aimAngle)
}

export function updateBotSprites(bots) {
    botSprites.forEach((data) => {
        data.sprite.visible = false
        data.weapon.visible = false
    })

    for (const bot of bots) {
        if (!bot) continue

        const data = ensureBotSprite(bot)
        if (!data) continue

        const player = bot.player
        updateAnimationState(data, player)
        applyPlayerTexture(data, player)

        const { x, y, aimAngle } = getRenderPosition(player)
        positionSprite(data.sprite, player, x, y)
        data.sprite.visible = true

        if (player.dead) {
            data.weapon.visible = false
        } else {
            const yOffset = player.crouch ? CROUCH_Y_OFFSET : 0
            positionWeapon(data.weapon, player, x, y + yOffset, aimAngle)
        }
    }
}

export function cleanupBotSprite(playerId) {
    const data = botSprites.get(playerId)
    if (!data) return

    data.sprite.destroy()
    data.weapon.destroy()
    botSprites.delete(playerId)
}

function createPlayerSprite(model, skin) {
    const frames = getModelAnimationFrames(model, skin, 'walk')
    if (frames.length === 0) return null

    const sprite = new PIXI.Sprite(frames[0])
    sprite.anchor.set(0.5)
    sprite.scale.set(PLAYER_SCALE_X, PLAYER_SCALE_Y)
    sprite.model = model
    sprite.skin = skin
    world.addChild(sprite)
    return sprite
}

function createWeaponSprite() {
    const sprite = new PIXI.Sprite()
    sprite.anchor.set(0.5)
    sprite.scale.set(WEAPON_SCALE)
    world.addChild(sprite)
    return sprite
}

function createBotData(model, skin) {
    const sprite = createPlayerSprite(model, skin)
    if (!sprite) return null

    return {
        sprite,
        weapon: createWeaponSprite(),
        model,
        skin,
        anim: 'walk',
        frame: 0,
        timer: 0,
    }
}

function ensureBotSprite(bot) {
    const { player } = bot
    const existing = botSprites.get(player.id)

    if (existing) {
        if (existing.model === player.model && existing.skin === player.skin) {
            return existing
        }
        cleanupBotSprite(player.id)
    }

    const data = createBotData(player.model, player.skin)
    if (data) botSprites.set(player.id, data)
    return data
}

function updateAnimationState(data, player) {
    const targetAnim = player.dead ? 'die' : player.crouch ? 'crouch' : 'walk'

    if (targetAnim !== data.anim) {
        data.anim = targetAnim
        data.frame = 0
        data.timer = 0
    }

    const frames = getModelAnimationFrames(player.model, player.skin, data.anim)
    const cfg = ANIMATION[data.anim]
    const isMoving = player.keyLeft !== player.keyRight || player.velocityX !== 0

    if (frames.length > 1 && ++data.timer >= cfg.refresh) {
        data.timer = 0
        if (cfg.loop) {
            if (isMoving || data.anim === 'crouch') {
                data.frame = (data.frame + 1) % frames.length
            }
        } else if (data.frame < frames.length - 1) {
            data.frame++
        }
    }
}

function applyPlayerTexture(data, player) {
    const frames = getModelAnimationFrames(player.model, player.skin, data.anim)
    if (frames[data.frame]) {
        data.sprite.texture = frames[data.frame]
    }
}

function positionSprite(sprite, player, x, y) {
    sprite.x = x
    sprite.scale.x = (player.facingLeft ? -1 : 1) * PLAYER_SCALE_X

    if (player.crouch) {
        sprite.scale.y = PLAYER_SCALE_Y * CROUCH_SCALE_FACTOR
        sprite.y = y + CROUCH_Y_OFFSET
    } else {
        sprite.scale.y = PLAYER_SCALE_Y
        sprite.y = y
    }
}

function positionWeapon(weapon, player, x, y, aimAngle) {
    const icon = getWeaponIcon(player.currentWeapon)
    if (!icon) {
        weapon.visible = false
        return
    }

    weapon.texture = icon
    weapon.x = x
    weapon.y = y
    weapon.rotation = aimAngle
    weapon.scale.x = WEAPON_SCALE
    weapon.scale.y = (player.facingLeft ? -1 : 1) * WEAPON_SCALE
    weapon.visible = true
}
