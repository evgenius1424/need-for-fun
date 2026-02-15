import * as PIXI from 'pixi.js'
import { WeaponId } from './helpers'
import { PhysicsConstants } from './engine/core/physics'
import {
    DEFAULT_MODEL,
    DEFAULT_SKIN,
    getAnimationConfig,
    getAnimationFile,
    getModelSkinKey,
} from './models'

const WEAPON_PATHS = {
    [WeaponId.GAUNTLET]: '/assets/weapons/gauntlet.png',
    [WeaponId.MACHINE]: '/assets/weapons/machinegun.png',
    [WeaponId.SHOTGUN]: '/assets/weapons/shotgun.png',
    [WeaponId.GRENADE]: '/assets/weapons/grenade.png',
    [WeaponId.ROCKET]: '/assets/weapons/rocket.png',
    [WeaponId.RAIL]: '/assets/weapons/railgun.png',
    [WeaponId.PLASMA]: '/assets/weapons/plasma.png',
    [WeaponId.SHAFT]: '/assets/weapons/shaft.png',
    [WeaponId.BFG]: '/assets/weapons/bfg.png',
}

const ITEM_PATHS = {
    health5: '/assets/items/health5.png',
    health25: '/assets/items/health25.png',
    health50: '/assets/items/health50.png',
    health100: '/assets/items/health100.png',
    armor50: '/assets/items/armor50.png',
    armor100: '/assets/items/armor100.png',
    quad: '/assets/items/quad.png',
}

const textures = {}

export async function loadAssets() {
    textures.brick = genBrickTexture()
    textures.explosion = genExplosionTexture()
    textures.smoke = genSmokeTexture()
    textures.background = await loadWithFallback(
        '/assets/backgrounds/bg_1.jpg',
        genBackgroundTexture,
    )
    textures.projectiles = {
        rocket: genProjectileTexture('rocket'),
        plasma: genProjectileTexture('plasma'),
        grenade: genProjectileTexture('grenade'),
        bfg: genProjectileTexture('bfg'),
    }

    textures.modelAnimations = {}
    await loadModelAnimations(DEFAULT_MODEL, DEFAULT_SKIN)
    textures.player =
        getModelAnimationFrames(DEFAULT_MODEL, DEFAULT_SKIN, 'walk')[0] || genPlayerTexture()

    textures.weaponIcons = await loadIconMap(WEAPON_PATHS)
    textures.itemIcons = await loadIconMap(ITEM_PATHS)

    return textures
}

export const getTexture = (name) => textures[name]
export const getProjectileTexture = (type) =>
    textures.projectiles?.[type] ?? textures.projectiles?.rocket
export const getWeaponIcon = (id) => textures.weaponIcons?.[id] ?? null
export const getItemIcon = (id) => textures.itemIcons?.[id] ?? null

export function getModelAnimationFrames(modelId, skinId, type) {
    const key = getModelSkinKey(modelId, skinId)
    return textures.modelAnimations?.[key]?.[type] ?? []
}

const pendingLoads = new Map()

export async function ensureModelLoaded(modelId, skinId) {
    const key = getModelSkinKey(modelId, skinId)
    if (textures.modelAnimations[key]) return

    if (pendingLoads.has(key)) {
        return pendingLoads.get(key)
    }

    const promise = loadModelAnimations(modelId, skinId)
    pendingLoads.set(key, promise)
    await promise
    pendingLoads.delete(key)
}

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

async function loadModelAnimations(modelId, skinId) {
    const key = getModelSkinKey(modelId, skinId)
    const animations = { walk: [], crouch: [], die: [] }
    const animConfig = getAnimationConfig(modelId)

    try {
        for (const [animType, cfg] of Object.entries(animConfig)) {
            const filePath = getAnimationFile(modelId, animType, skinId)
            const sheet = await PIXI.Assets.load(filePath)
            for (let i = 0; i < cfg.frames; i++) {
                animations[animType].push(
                    new PIXI.Texture(
                        sheet.baseTexture,
                        new PIXI.Rectangle(i * cfg.width, 0, cfg.width, cfg.height),
                    ),
                )
            }
        }
    } catch {
        const fallback = genPlayerTexture()
        animations.walk = [fallback]
        animations.crouch = [fallback]
        animations.die = [fallback]
    }

    textures.modelAnimations[key] = animations
}

function createCanvas(w, h) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return { canvas, ctx: canvas.getContext('2d') }
}

function genBrickTexture() {
    const { canvas, ctx } = createCanvas(PhysicsConstants.TILE_W, PhysicsConstants.TILE_H)

    ctx.fillStyle = '#888888'
    ctx.fillRect(0, 0, PhysicsConstants.TILE_W, PhysicsConstants.TILE_H)

    const imageData = ctx.getImageData(0, 0, PhysicsConstants.TILE_W, PhysicsConstants.TILE_H)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20
        data[i] = clamp(data[i] + noise)
        data[i + 1] = clamp(data[i + 1] + noise)
        data[i + 2] = clamp(data[i + 2] + noise)
    }
    ctx.putImageData(imageData, 0, 0)

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(0, 0, PhysicsConstants.TILE_W, 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(0, 0, 2, PhysicsConstants.TILE_H)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, PhysicsConstants.TILE_H - 2, PhysicsConstants.TILE_W, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(PhysicsConstants.TILE_W - 2, 0, 2, PhysicsConstants.TILE_H)

    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(1, 1, PhysicsConstants.TILE_W - 2, PhysicsConstants.TILE_H - 2)

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
            ctx.fillStyle = '#9aa3ad'
            ctx.beginPath()
            ctx.moveTo(16, 4)
            ctx.lineTo(4, 0)
            ctx.lineTo(0, 0)
            ctx.lineTo(0, 8)
            ctx.lineTo(4, 8)
            ctx.closePath()
            ctx.fill()
            ctx.fillStyle = '#6f7781'
            ctx.fillRect(4, 1, 8, 6)
            ctx.fillStyle = '#cfd5db'
            ctx.fillRect(5, 2, 7, 2)
            ctx.fillStyle = '#5a616b'
            ctx.fillRect(2, 1, 2, 6)
            ctx.fillStyle = '#dfe4ea'
            ctx.globalAlpha = 0.7
            ctx.fillRect(12, 2, 3, 2)
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

function genSmokeTexture() {
    const { canvas, ctx } = createCanvas(24, 24)
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12)
    g.addColorStop(0, 'rgba(255,255,255,0.8)')
    g.addColorStop(0.6, 'rgba(220,220,220,0.5)')
    g.addColorStop(1, 'rgba(200,200,200,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 24, 24)
    return PIXI.Texture.from(canvas)
}

function clamp(v, min = 0, max = 255) {
    return v < min ? min : v > max ? max : v
}
