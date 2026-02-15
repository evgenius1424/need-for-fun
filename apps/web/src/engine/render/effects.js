import * as PIXI from 'pixi.js'
import { Settings } from '../../helpers'
import { Projectiles } from '../../projectiles'
import { getProjectileTexture, getTexture } from '../../assets'
import {
    aimLine,
    bulletImpacts,
    explosionsLayer,
    gauntletSparks,
    projectiles,
    railLines,
    shaftLines,
    smokeLayer,
} from './app'
import {
    GRENADE_SMOKE_INTERVAL,
    PROJECTILE_COLORS,
    ROCKET_SMOKE_INTERVAL,
    SMOKE_MAX_AGE,
} from './constants'
import { Physics, PhysicsConstants } from '../core/physics'
import { getRenderPosition } from '../core/camera'
const SPARK_COUNT = 8
const CROUCH_Y_OFFSET = 4

const pools = {
    projectile: [],
    smoke: [],
    explosion: [],
}

const state = {
    explosions: [],
    smokePuffs: [],
    railShots: [],
    shaftShots: [],
    bulletHits: [],
    gauntletHits: [],
}

function pushExplosion(x, y, type) {
    const isLarge = type === 'rocket' || type === 'grenade' || type === 'bfg'
    const radius = isLarge ? 40 : 15
    state.explosions.push({
        x,
        y,
        radius,
        maxRadius: radius,
        age: 0,
        maxAge: 15,
        color: PROJECTILE_COLORS[type] ?? 0xff6600,
    })
}

Projectiles.onExplosion((x, y, type) => {
    pushExplosion(x, y, type)
})

export function addRailShot(shot) {
    state.railShots.push({
        x1: shot.startX,
        y1: shot.startY,
        x2: shot.trace.x,
        y2: shot.trace.y,
        age: 0,
        maxAge: Math.max(1, Settings.railTrailTime),
    })
}

export function addShaftShot(shot) {
    state.shaftShots.push({
        x1: shot.startX,
        y1: shot.startY,
        x2: shot.trace.x,
        y2: shot.trace.y,
        age: 0,
        maxAge: 6,
    })
}

export function addBulletImpact(x, y, options = {}) {
    state.bulletHits.push({
        x,
        y,
        age: 0,
        maxAge: options.maxAge ?? 12,
        radius: options.radius ?? 2.5,
        color: options.color ?? 0xffd24a,
        alpha: options.alpha ?? 0.9,
    })
}

export function addGauntletSpark(x, y, options = {}) {
    state.gauntletHits.push({
        x,
        y,
        age: 0,
        maxAge: options.maxAge ?? 6,
        radius: options.radius ?? 5,
        color: options.color ?? 0x6ff2ff,
        alpha: options.alpha ?? 0.9,
    })
}

export function addExplosion(x, y, type) {
    pushExplosion(x, y, type)
}

export function renderSmoke() {
    hidePool(pools.smoke)
    processAgedEffects(state.smokePuffs, renderSmokePuff)
}

export function renderProjectiles() {
    hidePool(pools.projectile)
    const alpha = clamp(Physics.getAlpha(), 0, 1)

    for (const proj of Projectiles.getAll()) {
        if (!proj.active) continue
        maybeAddProjectileSmoke(proj)
        renderProjectile(proj, alpha)
    }
}

export function renderExplosions() {
    hidePool(pools.explosion)
    processAgedEffects(state.explosions, renderExplosion)
}

export function renderRailShots() {
    railLines.clear()
    processAgedEffects(state.railShots, renderRailShot)
}

export function renderShaftShots() {
    shaftLines.clear()
    processAgedEffects(state.shaftShots, renderShaftShot)
}

export function renderBulletImpacts() {
    bulletImpacts.clear()
    processAgedEffects(state.bulletHits, renderBulletHit)
}

export function renderGauntletSparks() {
    gauntletSparks.clear()
    processAgedEffects(state.gauntletHits, renderGauntletHit)
}

export function renderAimLine(player) {
    aimLine.clear()
    if (!player || player.dead) return

    const { x, y, aimAngle } = getRenderPosition(player)
    const originY = player.crouch ? y + CROUCH_Y_OFFSET : y
    const dist = PhysicsConstants.TILE_W * 2.6
    const half = Math.max(2, PhysicsConstants.TILE_W * 0.1)
    const crossX = x + Math.cos(aimAngle) * dist
    const crossY = originY + Math.sin(aimAngle) * dist

    drawLine(aimLine, crossX - half, crossY, crossX + half, crossY, 1, 0xffffff, 0.7)
    drawLine(aimLine, crossX, crossY - half, crossX, crossY + half, 1, 0xffffff, 0.7)
}

function processAgedEffects(arr, renderFn) {
    for (let i = arr.length - 1; i >= 0; i--) {
        const item = arr[i]
        if (++item.age > item.maxAge) {
            arr.splice(i, 1)
            continue
        }
        renderFn(item)
    }
}

function renderSmokePuff(puff) {
    puff.x += puff.vx
    puff.y += puff.vy

    const progress = puff.age / puff.maxAge
    const sprite = poolGet(pools.smoke, smokeLayer, createSmokeSprite)
    sprite.x = puff.x
    sprite.y = puff.y
    sprite.scale.set(puff.baseScale * (1 + progress * 1.4))
    sprite.alpha = (1 - progress) * puff.alpha
    sprite.tint = puff.tint
}

function renderProjectile(proj, alpha) {
    const sprite = poolGet(pools.projectile, projectiles, createProjectileSprite)
    sprite.texture = getProjectileTexture(proj.type)

    const prevX = Number.isFinite(proj.prevX) ? proj.prevX : proj.x
    const prevY = Number.isFinite(proj.prevY) ? proj.prevY : proj.y
    sprite.x = lerp(prevX, proj.x, alpha)
    sprite.y = lerp(prevY, proj.y, alpha)
    sprite.rotation = Math.atan2(proj.velocityY, proj.velocityX)
    sprite.tint = PROJECTILE_COLORS[proj.type] ?? 0xffffff
}

function renderExplosion(exp) {
    const progress = exp.age / exp.maxAge
    const sprite = poolGet(pools.explosion, explosionsLayer, createExplosionSprite)
    sprite.x = exp.x
    sprite.y = exp.y
    sprite.scale.set((1 + progress) * (exp.radius / 16))
    sprite.alpha = 1 - progress
    sprite.tint = exp.color
}

function renderRailShot(shot) {
    const progress = shot.age / shot.maxAge
    const alpha = Settings.railProgressiveAlpha ? 1 - progress : 1
    const width = Math.max(2, Settings.railWidth)
    const baseColor = Settings.railColor
    const glowColor = tintColor(baseColor, 0.6)
    const coreColor = tintColor(baseColor, 0.85)

    const jitter = 1.5 + Math.random() * 1.5
    const { nx, ny } = getNormal(shot, jitter)
    const type = Settings.railType

    drawLine(railLines, shot.x1, shot.y1, shot.x2, shot.y2, width, glowColor, alpha * 0.35)

    if (type === 1) {
        drawLine(
            railLines,
            shot.x1 - nx,
            shot.y1 - ny,
            shot.x2 - nx,
            shot.y2 - ny,
            width * 0.5,
            coreColor,
            alpha * 0.7,
        )
    } else if (type === 2) {
        drawLine(
            railLines,
            shot.x1 + nx * 0.6,
            shot.y1 + ny * 0.6,
            shot.x2 + nx * 0.6,
            shot.y2 + ny * 0.6,
            width * 0.6,
            coreColor,
            alpha * 0.8,
        )
    }

    drawLine(
        railLines,
        shot.x1,
        shot.y1,
        shot.x2,
        shot.y2,
        Math.max(2, width * 0.25),
        0xffffff,
        alpha,
    )
    railLines.beginFill(coreColor, alpha * 0.6)
    railLines.drawCircle(shot.x2, shot.y2, Math.max(4, width * 0.75))
    railLines.endFill()
}

function renderShaftShot(shot) {
    const alpha = 1 - shot.age / shot.maxAge
    const jitter = (Math.random() - 0.5) * 2.5
    const { nx, ny } = getNormal(shot, jitter)

    drawLine(shaftLines, shot.x1, shot.y1, shot.x2, shot.y2, 8, 0x2b6cff, alpha * 0.25)
    drawLine(
        shaftLines,
        shot.x1 + nx,
        shot.y1 + ny,
        shot.x2 + nx,
        shot.y2 + ny,
        4,
        0x45c8ff,
        alpha * 0.65,
    )
    drawLine(shaftLines, shot.x1, shot.y1, shot.x2, shot.y2, 2, 0xe8fbff, alpha)
}

function tintColor(color, amount) {
    const r = ((color >> 16) & 0xff) / 255
    const g = ((color >> 8) & 0xff) / 255
    const b = (color & 0xff) / 255
    const mix = (v) => Math.min(1, v * (0.7 + amount * 0.3))
    const rr = Math.round(mix(r) * 255)
    const gg = Math.round(mix(g) * 255)
    const bb = Math.round(mix(b) * 255)
    return (rr << 16) | (gg << 8) | bb
}

function renderBulletHit(hit) {
    const alpha = (1 - hit.age / hit.maxAge) * hit.alpha
    bulletImpacts.beginFill(0xc08900, alpha * 0.4)
    bulletImpacts.drawCircle(hit.x, hit.y, hit.radius * 2)
    bulletImpacts.endFill()
    bulletImpacts.beginFill(hit.color, alpha)
    bulletImpacts.drawCircle(hit.x, hit.y, hit.radius)
    bulletImpacts.endFill()
}

function renderGauntletHit(hit) {
    const alpha = (1 - hit.age / hit.maxAge) * hit.alpha
    const jitter = hit.radius * 0.55

    for (let j = 0; j < SPARK_COUNT; j++) {
        const angle = Math.random() * Math.PI * 2
        const dist = hit.radius * (0.4 + Math.random() * 0.7)
        const x1 = hit.x + Math.cos(angle) * dist
        const y1 = hit.y + Math.sin(angle) * dist
        const x2 = x1 + (Math.random() - 0.5) * jitter
        const y2 = y1 + (Math.random() - 0.5) * jitter

        drawLine(gauntletSparks, hit.x, hit.y, x1, y1, 2, hit.color, alpha * 0.7)
        drawLine(gauntletSparks, x1, y1, x2, y2, 1, 0xffffff, alpha)
    }
}

function maybeAddProjectileSmoke(proj) {
    if (proj.type === 'rocket' && proj.age % ROCKET_SMOKE_INTERVAL === 0) {
        addSmokePuff(proj, ROCKET_SMOKE_CONFIG)
    }
    if (proj.type === 'grenade' && proj.age % GRENADE_SMOKE_INTERVAL === 0) {
        addSmokePuff(proj, GRENADE_SMOKE_CONFIG)
    }
}

const ROCKET_SMOKE_CONFIG = {}

const GRENADE_SMOKE_CONFIG = {
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
}

function addSmokePuff(proj, config = {}) {
    const {
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
    } = config

    const speed = Math.hypot(proj.velocityX, proj.velocityY)
    const nx = speed > 0.01 ? proj.velocityX / speed : 1
    const ny = speed > 0.01 ? proj.velocityY / speed : 0
    const backOffset = randRange(backOffsetMin, backOffsetMax)
    const spread = 3
    const gray = Math.floor(randRange(grayMin, grayMax))

    state.smokePuffs.push({
        x: proj.x - nx * backOffset + (Math.random() - 0.5) * spread,
        y: proj.y - ny * backOffset + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.4,
        vy: randRange(upMin, upMax),
        age: 0,
        maxAge: maxAge + Math.floor(Math.random() * 10),
        baseScale: randRange(baseScaleMin, baseScaleMax),
        alpha,
        tint: (gray << 16) | (gray << 8) | gray,
    })
}

function createSmokeSprite() {
    const s = new PIXI.Sprite(getTexture('smoke'))
    s.anchor.set(0.5)
    return s
}

function createProjectileSprite() {
    const s = new PIXI.Sprite()
    s.anchor.set(0.5)
    return s
}

function createExplosionSprite() {
    const s = new PIXI.Sprite(getTexture('explosion'))
    s.anchor.set(0.5)
    return s
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

function hidePool(pool) {
    for (const s of pool) s.visible = false
}

function getNormal(shot, scale) {
    const dx = shot.x2 - shot.x1
    const dy = shot.y2 - shot.y1
    const len = Math.hypot(dx, dy) || 1
    return { nx: (-dy / len) * scale, ny: (dx / len) * scale }
}

function drawLine(g, x1, y1, x2, y2, width, color, alpha) {
    g.lineStyle(width, color, alpha)
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
}

function lerp(a, b, t) {
    return a + (b - a) * t
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}

function randRange(min, max) {
    return min + Math.random() * (max - min)
}
