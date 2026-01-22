import * as PIXI from 'pixi.js'
import { WeaponId } from './helpers'

// Texture cache
const textures = {}

/**
 * Generate a brick texture with beveled edges (32x16)
 */
function generateBrickTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 16
    const ctx = canvas.getContext('2d')

    // Base color with slight variation
    ctx.fillStyle = '#888888'
    ctx.fillRect(0, 0, 32, 16)

    // Add noise texture
    const imageData = ctx.getImageData(0, 0, 32, 16)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20
        data[i] = Math.max(0, Math.min(255, data[i] + noise))
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
    }
    ctx.putImageData(imageData, 0, 0)

    // Top edge highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.fillRect(0, 0, 32, 2)

    // Left edge highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.fillRect(0, 0, 2, 16)

    // Bottom edge shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 14, 32, 2)

    // Right edge shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.fillRect(30, 0, 2, 16)

    // Inner border line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(1, 1, 30, 14)

    return PIXI.Texture.from(canvas)
}

/**
 * Generate a tileable background texture (64x64)
 */
function generateBackgroundTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')

    // Dark base
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, 64, 64)

    // Add perlin-like noise pattern
    for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
            const noise =
                Math.sin(x * 0.3) * Math.cos(y * 0.3) * 10 +
                Math.sin(x * 0.7 + y * 0.5) * 5 +
                (Math.random() - 0.5) * 15
            const brightness = Math.max(0, Math.min(255, 26 + noise))
            ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness + 10})`
            ctx.fillRect(x, y, 1, 1)
        }
    }

    // Add subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
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

/**
 * Generate a player texture (20x48) - humanoid silhouette
 */
function generatePlayerTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 20
    canvas.height = 48
    const ctx = canvas.getContext('2d')

    // Use neutral gray - will be tinted at runtime
    const baseColor = '#cccccc'
    const darkColor = '#888888'
    const lightColor = '#ffffff'

    // Body (torso)
    ctx.fillStyle = baseColor
    ctx.fillRect(6, 12, 8, 20)

    // Head (profile, facing right)
    ctx.beginPath()
    ctx.arc(13, 7, 5, 0, Math.PI * 2)
    ctx.fillStyle = baseColor
    ctx.fill()

    // Visor/face detail
    ctx.fillStyle = darkColor
    ctx.fillRect(12, 5, 6, 3)

    // Backpack
    ctx.fillStyle = darkColor
    ctx.fillRect(4, 14, 2, 12)

    // Arms (front arm extended)
    ctx.fillStyle = baseColor
    ctx.fillRect(12, 16, 6, 4)
    ctx.fillRect(7, 17, 3, 4)

    // Legs (front/back)
    ctx.fillStyle = baseColor
    ctx.fillRect(10, 32, 4, 14)
    ctx.fillRect(6, 32, 3, 14)

    // Armor details
    ctx.fillStyle = darkColor
    ctx.fillRect(8, 16, 5, 2)
    ctx.fillRect(7, 22, 7, 2)

    // Highlights
    ctx.fillStyle = lightColor
    ctx.globalAlpha = 0.3
    ctx.fillRect(8, 13, 5, 1)
    ctx.globalAlpha = 1

    return PIXI.Texture.from(canvas)
}

/**
 * Generate projectile textures
 */
function generateProjectileTexture(type) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    switch (type) {
        case 'rocket': {
            canvas.width = 16
            canvas.height = 8
            // Rocket body
            ctx.fillStyle = '#ff6600'
            ctx.beginPath()
            ctx.moveTo(16, 4)
            ctx.lineTo(4, 0)
            ctx.lineTo(0, 0)
            ctx.lineTo(0, 8)
            ctx.lineTo(4, 8)
            ctx.closePath()
            ctx.fill()
            // Flame trail
            ctx.fillStyle = '#ffff00'
            ctx.fillRect(0, 2, 3, 4)
            // Tip highlight
            ctx.fillStyle = '#ffffff'
            ctx.globalAlpha = 0.5
            ctx.fillRect(12, 3, 3, 2)
            break
        }
        case 'plasma': {
            canvas.width = 12
            canvas.height = 12
            // Outer glow
            const gradient = ctx.createRadialGradient(6, 6, 0, 6, 6, 6)
            gradient.addColorStop(0, '#ffffff')
            gradient.addColorStop(0.3, '#00ffff')
            gradient.addColorStop(1, 'rgba(0, 255, 255, 0)')
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, 12, 12)
            break
        }
        case 'grenade': {
            canvas.width = 10
            canvas.height = 10
            // Grenade body
            ctx.fillStyle = '#666666'
            ctx.beginPath()
            ctx.arc(5, 5, 4, 0, Math.PI * 2)
            ctx.fill()
            // Highlight
            ctx.fillStyle = '#888888'
            ctx.beginPath()
            ctx.arc(4, 4, 2, 0, Math.PI * 2)
            ctx.fill()
            // Pin detail
            ctx.fillStyle = '#444444'
            ctx.fillRect(4, 0, 2, 2)
            break
        }
        case 'bfg': {
            canvas.width = 24
            canvas.height = 24
            // Large glowing orb
            const bfgGradient = ctx.createRadialGradient(12, 12, 0, 12, 12, 12)
            bfgGradient.addColorStop(0, '#ffffff')
            bfgGradient.addColorStop(0.2, '#00ff00')
            bfgGradient.addColorStop(0.6, '#00aa00')
            bfgGradient.addColorStop(1, 'rgba(0, 255, 0, 0)')
            ctx.fillStyle = bfgGradient
            ctx.fillRect(0, 0, 24, 24)
            break
        }
        default: {
            canvas.width = 8
            canvas.height = 8
            ctx.fillStyle = '#ff0000'
            ctx.beginPath()
            ctx.arc(4, 4, 3, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    return PIXI.Texture.from(canvas)
}

/**
 * Generate explosion texture (32x32)
 */
function generateExplosionTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')

    // Radial gradient burst
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.2, '#ffff00')
    gradient.addColorStop(0.5, '#ff6600')
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 32, 32)

    // Add some particle-like details
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        const x = 16 + Math.cos(angle) * 8
        const y = 16 + Math.sin(angle) * 8
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()
    }

    return PIXI.Texture.from(canvas)
}

/**
 * Load all assets and return a Promise
 */
export async function loadAssets() {
    textures.brick = generateBrickTexture()
    textures.explosion = generateExplosionTexture()

    let backgroundTexture = null
    try {
        backgroundTexture = await PIXI.Assets.load('/assets/nfk/backgrounds/bg_1.jpg')
    } catch (error) {
        backgroundTexture = generateBackgroundTexture()
    }
    textures.background = backgroundTexture

    let playerTexture = null
    try {
        const sargeTexture = await PIXI.Assets.load('/assets/nfk/models/sarge/wbn.png')
        playerTexture = new PIXI.Texture({
            source: sargeTexture.source,
            frame: new PIXI.Rectangle(0, 0, 48, 48),
        })
    } catch (error) {
        playerTexture = generatePlayerTexture()
    }
    textures.player = playerTexture

    textures.weaponIcons = {}
    const weaponIconPaths = {
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
    await Promise.all(
        Object.entries(weaponIconPaths).map(async ([weaponId, path]) => {
            try {
                textures.weaponIcons[weaponId] = await PIXI.Assets.load(path)
            } catch (error) {
                textures.weaponIcons[weaponId] = null
            }
        }),
    )

    // Projectile textures
    textures.projectiles = {
        rocket: generateProjectileTexture('rocket'),
        plasma: generateProjectileTexture('plasma'),
        grenade: generateProjectileTexture('grenade'),
        bfg: generateProjectileTexture('bfg'),
    }

    return textures
}

/**
 * Get a loaded texture by name
 */
export function getTexture(name) {
    return textures[name]
}

/**
 * Get projectile texture by type
 */
export function getProjectileTexture(type) {
    return textures.projectiles?.[type] || textures.projectiles?.rocket
}

export function getWeaponIcon(weaponId) {
    return textures.weaponIcons?.[weaponId] || null
}

export const Assets = {
    loadAssets,
    getTexture,
    getProjectileTexture,
    getWeaponIcon,
}
