import * as PIXI from 'pixi.js'
import { Constants, WeaponId } from './helpers'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants

const ANIM_CONFIG = {
    walk: { frames: 18, width: 45, height: 48, file: 'wb.png' },
    crouch: { frames: 10, width: 50, height: 40, file: 'cb.png' },
    die: { frames: 30, width: 45, height: 48, file: 'db.png' },
}

const WEAPON_PATHS = {
    [WeaponId.GAUNTLET]: '/assets/nfk/weapons/gauntlet.png',
    [WeaponId.MACHINE]: '/assets/nfk/weapons/machinegun.png',
    [WeaponId.SHOTGUN]: '/assets/nfk/weapons/shotgun.png',
    [WeaponId.GRENADE]: '/assets/nfk/weapons/grenade.png',
    [WeaponId.ROCKET]: '/assets/nfk/weapons/rocket.png',
    [WeaponId.RAIL]: '/assets/nfk/weapons/railgun.png',
    [WeaponId.PLASMA]: '/assets/nfk/weapons/plasma.png',
    [WeaponId.SHAFT]: '/assets/nfk/weapons/shaft.png',
    [WeaponId.BFG]: '/assets/nfk/weapons/bfg.png',
}

const ITEM_PATHS = {
    health5: '/assets/nfk/items/health5.png',
    health25: '/assets/nfk/items/health25.png',
    health50: '/assets/nfk/items/health50.png',
    health100: '/assets/nfk/items/health100.png',
    armor50: '/assets/nfk/items/armor50.png',
    armor100: '/assets/nfk/items/armor100.png',
    quad: '/assets/nfk/items/quad.png',
}

const textures = {}

export async function loadAssets() {
    textures.brick = genBrickTexture()
    textures.explosion = genExplosionTexture()
    textures.background = await loadWithFallback(
        '/assets/nfk/backgrounds/bg_1.jpg',
        genBackgroundTexture,
    )
    textures.projectiles = {
        rocket: genProjectileTexture('rocket'),
        plasma: genProjectileTexture('plasma'),
        grenade: genProjectileTexture('grenade'),
        bfg: genProjectileTexture('bfg'),
    }

    await loadPlayerAnimations()
    textures.player = textures.playerAnimations.walk[0] || genPlayerTexture()

    textures.weaponIcons = await loadIconMap(WEAPON_PATHS)
    textures.itemIcons = await loadIconMap(ITEM_PATHS)

    return textures
}

export const getTexture = (name) => textures[name]
export const getProjectileTexture = (type) =>
    textures.projectiles?.[type] ?? textures.projectiles?.rocket
export const getWeaponIcon = (id) => textures.weaponIcons?.[id] ?? null
export const getItemIcon = (id) => textures.itemIcons?.[id] ?? null
export const getPlayerAnimationFrames = (type) => textures.playerAnimations?.[type] ?? []

async function loadWithFallback(path, fallbackFn) {
    try {
        return await PIXI.Assets.load(path)
    } catch {
        return fallbackFn()
    }
}

async function loadIconMap(paths) {
    const icons = {}
    await Promise.all(
        Object.entries(paths).map(async ([id, path]) => {
            try {
                icons[id] = await PIXI.Assets.load(path)
            } catch {
                icons[id] = null
            }
        }),
    )
    return icons
}

async function loadPlayerAnimations() {
    textures.playerAnimations = { walk: [], crouch: [], die: [] }

    try {
        for (const [name, cfg] of Object.entries(ANIM_CONFIG)) {
            const sheet = await PIXI.Assets.load(`/assets/nfk/models/sarge/${cfg.file}`)
            for (let i = 0; i < cfg.frames; i++) {
                textures.playerAnimations[name].push(
                    new PIXI.Texture({
                        source: sheet.source,
                        frame: new PIXI.Rectangle(i * cfg.width, 0, cfg.width, cfg.height),
                    }),
                )
            }
        }
    } catch {
        const fallback = genPlayerTexture()
        textures.playerAnimations.walk = [fallback]
        textures.playerAnimations.crouch = [fallback]
        textures.playerAnimations.die = [fallback]
    }
}

function createCanvas(w, h) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return { canvas, ctx: canvas.getContext('2d') }
}

function genBrickTexture() {
    const { canvas, ctx } = createCanvas(BRICK_WIDTH, BRICK_HEIGHT)

    ctx.fillStyle = '#888888'
    ctx.fillRect(0, 0, BRICK_WIDTH, BRICK_HEIGHT)

    const imageData = ctx.getImageData(0, 0, BRICK_WIDTH, BRICK_HEIGHT)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20
        data[i] = clamp(data[i] + noise)
        data[i + 1] = clamp(data[i + 1] + noise)
        data[i + 2] = clamp(data[i + 2] + noise)
    }
    ctx.putImageData(imageData, 0, 0)

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(0, 0, BRICK_WIDTH, 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(0, 0, 2, BRICK_HEIGHT)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, BRICK_HEIGHT - 2, BRICK_WIDTH, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(BRICK_WIDTH - 2, 0, 2, BRICK_HEIGHT)

    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(1, 1, BRICK_WIDTH - 2, BRICK_HEIGHT - 2)

    return PIXI.Texture.from(canvas)
}

function genBackgroundTexture() {
    const { canvas, ctx } = createCanvas(64, 64)

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, 64, 64)

    for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
            const noise =
                Math.sin(x * 0.3) * Math.cos(y * 0.3) * 10 +
                Math.sin(x * 0.7 + y * 0.5) * 5 +
                (Math.random() - 0.5) * 15
            const b = clamp(26 + noise)
            ctx.fillStyle = `rgb(${b},${b},${b + 10})`
            ctx.fillRect(x, y, 1, 1)
        }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let i = 0; i < 64; i += 16) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, 64)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, i)
        ctx.lineTo(64, i)
        ctx.stroke()
    }

    return PIXI.Texture.from(canvas)
}

function genPlayerTexture() {
    const { canvas, ctx } = createCanvas(20, 48)
    const base = '#cccccc',
        dark = '#888888',
        light = '#ffffff'

    ctx.fillStyle = base
    ctx.fillRect(6, 12, 8, 20)
    ctx.beginPath()
    ctx.arc(13, 7, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = dark
    ctx.fillRect(12, 5, 6, 3)
    ctx.fillRect(4, 14, 2, 12)
    ctx.fillRect(8, 16, 5, 2)
    ctx.fillRect(7, 22, 7, 2)

    ctx.fillStyle = base
    ctx.fillRect(12, 16, 6, 4)
    ctx.fillRect(7, 17, 3, 4)
    ctx.fillRect(10, 32, 4, 14)
    ctx.fillRect(6, 32, 3, 14)

    ctx.fillStyle = light
    ctx.globalAlpha = 0.3
    ctx.fillRect(8, 13, 5, 1)

    return PIXI.Texture.from(canvas)
}

function genExplosionTexture() {
    const { canvas, ctx } = createCanvas(32, 32)

    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.2, '#ffff00')
    gradient.addColorStop(0.5, '#ff6600')
    gradient.addColorStop(1, 'rgba(255,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 32, 32)

    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(16 + Math.cos(angle) * 8, 16 + Math.sin(angle) * 8, 2, 0, Math.PI * 2)
        ctx.fill()
    }

    return PIXI.Texture.from(canvas)
}

function genProjectileTexture(type) {
    const generators = {
        rocket() {
            const { canvas, ctx } = createCanvas(16, 8)
            ctx.fillStyle = '#ff6600'
            ctx.beginPath()
            ctx.moveTo(16, 4)
            ctx.lineTo(4, 0)
            ctx.lineTo(0, 0)
            ctx.lineTo(0, 8)
            ctx.lineTo(4, 8)
            ctx.closePath()
            ctx.fill()
            ctx.fillStyle = '#ffff00'
            ctx.fillRect(0, 2, 3, 4)
            ctx.fillStyle = '#ffffff'
            ctx.globalAlpha = 0.5
            ctx.fillRect(12, 3, 3, 2)
            return canvas
        },
        plasma() {
            const { canvas, ctx } = createCanvas(12, 12)
            const g = ctx.createRadialGradient(6, 6, 0, 6, 6, 6)
            g.addColorStop(0, '#ffffff')
            g.addColorStop(0.3, '#00ffff')
            g.addColorStop(1, 'rgba(0,255,255,0)')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, 12, 12)
            return canvas
        },
        grenade() {
            const { canvas, ctx } = createCanvas(10, 10)
            ctx.fillStyle = '#666666'
            ctx.beginPath()
            ctx.arc(5, 5, 4, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#888888'
            ctx.beginPath()
            ctx.arc(4, 4, 2, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#444444'
            ctx.fillRect(4, 0, 2, 2)
            return canvas
        },
        bfg() {
            const { canvas, ctx } = createCanvas(24, 24)
            const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12)
            g.addColorStop(0, '#ffffff')
            g.addColorStop(0.2, '#00ff00')
            g.addColorStop(0.6, '#00aa00')
            g.addColorStop(1, 'rgba(0,255,0,0)')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, 24, 24)
            return canvas
        },
    }

    const gen = generators[type]
    if (gen) return PIXI.Texture.from(gen())

    const { canvas, ctx } = createCanvas(8, 8)
    ctx.fillStyle = '#ff0000'
    ctx.beginPath()
    ctx.arc(4, 4, 3, 0, Math.PI * 2)
    ctx.fill()
    return PIXI.Texture.from(canvas)
}

function clamp(v, min = 0, max = 255) {
    return v < min ? min : v > max ? max : v
}
