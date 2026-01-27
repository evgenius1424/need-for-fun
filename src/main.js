import { Howler } from 'howler'
import {
    Constants,
    Console,
    GameConstants,
    Input,
    Settings,
    Sound,
    WeaponConstants,
    WeaponId,
} from './helpers'
import { Map } from './map'
import { Player } from './player'
import { Physics } from './engine/core/physics'
import { Render } from './engine/render'
import { Projectiles } from './projectiles'
import { loadAssets, ensureModelLoaded } from './assets'
import { BotManager } from './botManager'
import { SkinId } from './models'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants
const { DAMAGE, AMMO_PICKUP } = WeaponConstants
const { MAX_HEALTH, MEGA_HEALTH, QUAD_MULTIPLIER, QUAD_DURATION } = GameConstants

const AIM_INPUT_SCALE = 0.5
const EXPLOSION_RADIUS = 90
const PICKUP_RADIUS = 16
const MAX_AIM_DELTA = 12
const HITSCAN_PLAYER_RADIUS = 14
const GAUNTLET_PLAYER_RADIUS = 22
const GAUNTLET_SPARK_OFFSET = BRICK_WIDTH * 0.55

const ITEM_DEFS = {
    health5: { kind: 'health', amount: 5, max: MAX_HEALTH, respawn: 300 },
    health25: { kind: 'health', amount: 25, max: MAX_HEALTH, respawn: 300 },
    health50: { kind: 'health', amount: 50, max: MAX_HEALTH, respawn: 600 },
    health100: { kind: 'health', amount: 100, max: MEGA_HEALTH, respawn: 900 },
    armor50: { kind: 'armor', amount: 50, respawn: 600 },
    armor100: { kind: 'armor', amount: 100, respawn: 900 },
    quad: { kind: 'quad', respawn: 1200 },
    weapon_machine: { kind: 'weapon', weaponId: WeaponId.MACHINE, respawn: 600 },
    weapon_shotgun: { kind: 'weapon', weaponId: WeaponId.SHOTGUN, respawn: 600 },
    weapon_grenade: { kind: 'weapon', weaponId: WeaponId.GRENADE, respawn: 600 },
    weapon_rocket: { kind: 'weapon', weaponId: WeaponId.ROCKET, respawn: 600 },
}

const PROJECTILE_WEAPONS = new Set(['rocket', 'grenade', 'plasma', 'bfg'])

Console.writeText('boot: main start')
await loadAssets()
Console.writeText('boot: assets ok')
await Map.loadFromQuery()
Console.writeText('boot: map ok')

const localPlayer = new Player()

// Load bot skin (red) for enemies
await ensureModelLoaded(localPlayer.model, SkinId.RED)

Render.initSprites(localPlayer)
Console.writeText('boot: sprites ok')
Render.renderMap()
Console.writeText('boot: map render ok')
Render.setSceneReady(true)
Console.writeText('boot: scene ready')

const state = { lastMouseY: Input.mouseY, lastMoveDir: 0 }

BotManager.init(localPlayer)
spawnPlayer(localPlayer)
setupPointerLock()
setupExplosionHandlers()

// Spawn 1 bot for testing
BotManager.spawnBot('easy')

requestAnimationFrame((ts) => gameLoop(ts, localPlayer))

function spawnPlayer(player) {
    const { col, row } = Map.getRandomRespawn()
    player.setXY(col * BRICK_WIDTH + 10, row * BRICK_HEIGHT - 24)
    player.prevX = player.x
    player.prevY = player.y
    player.aimAngle = 0
    player.prevAimAngle = 0
    player.facingLeft = false
    player.spawnProtection = 120
}

function setupPointerLock() {
    const gameRoot = document.getElementById('game')
    gameRoot?.addEventListener('click', () => {
        Sound.unlock()
        Howler.ctx?.state === 'suspended' && Howler.ctx.resume()
        const canvas = gameRoot.querySelector('canvas')
        if (canvas && document.pointerLockElement !== canvas) {
            canvas.requestPointerLock()
        }
    })
}

function setupExplosionHandlers() {
    Projectiles.onExplosion((x, y, type, proj) => {
        if (type !== 'rocket') return

        for (const player of BotManager.getAllPlayers()) {
            if (player.dead) continue

            const dx = player.x - x
            const dy = player.y - y
            const distance = Math.hypot(dx, dy)

            if (distance >= EXPLOSION_RADIUS) continue

            const falloff = 1 - distance / EXPLOSION_RADIUS
            const damage = DAMAGE[WeaponId.ROCKET] * falloff

            if (damage > 0) {
                player.takeDamage(damage, proj?.ownerId ?? player.id)
            }

            if (distance > 0) {
                const knockback = (4 * falloff) / distance
                player.velocityX += dx * knockback
                player.velocityY += dy * knockback
            }
        }
    })
}

function gameLoop(timestamp, player) {
    for (const p of BotManager.getAllPlayers()) {
        p.prevAimAngle = p.aimAngle
    }

    // Process local player input
    processMovementInput(player)
    processWeaponScroll(player)
    processWeaponSwitch(player)
    processAimInput(player)
    processFiring(player)

    // Update bots AI
    BotManager.update()

    // Process bot firing
    for (const bot of BotManager.getBots()) {
        const result = bot.applyFiring()
        if (result) {
            processBotFireResult(bot.player, result)
        }
    }

    // Update all players
    player.update()
    player.checkRespawn() // Handle local player respawn
    for (const bot of BotManager.getBots()) {
        bot.player.update()
    }

    // Update physics for all players (synchronized)
    Physics.updateAllPlayers(BotManager.getAllPlayers(), timestamp)

    Projectiles.update()

    // Process hits for all players
    for (const p of BotManager.getAllPlayers()) {
        processProjectileHits(p)
    }

    // Process item pickups for all players
    for (const p of BotManager.getAllPlayers()) {
        processItemPickups(p)
    }

    Render.renderGame(player, BotManager.getBots())
    requestAnimationFrame((ts) => gameLoop(ts, player))
}

function processBotFireResult(botPlayer, result) {
    const otherPlayers = BotManager.getOtherPlayers(botPlayer)

    if (result?.type === 'rail') {
        Render.addRailShot(result)
        applyHitscanDamage(botPlayer, result, otherPlayers)
    }
    if (result?.type === 'shaft') {
        Render.addShaftShot(result)
        applyHitscanDamage(botPlayer, result, otherPlayers)
    }
    if (result?.type === 'hitscan') {
        Render.addBulletImpact(result.trace.x, result.trace.y, { radius: 2.5 })
        applyHitscanDamage(botPlayer, result, otherPlayers)
    }
    if (result?.type === 'shotgun') {
        for (const pellet of result.pellets) {
            const shot = { startX: result.startX, startY: result.startY, trace: pellet.trace }
            Render.addBulletImpact(shot.trace.x, shot.trace.y, { radius: 2 })
            applyHitscanDamage(botPlayer, { ...shot, damage: pellet.damage }, otherPlayers)
        }
    }
    if (result?.type === 'gauntlet') {
        const { x, y } = getWeaponTip(botPlayer, GAUNTLET_SPARK_OFFSET)
        Render.addGauntletSpark(x, y)
        applyMeleeDamage(botPlayer, result, otherPlayers)
    }
}

function processMovementInput(player) {
    player.keyUp = Input.keyUp
    player.keyDown = Input.keyDown
    player.keyLeft = Input.keyLeft
    player.keyRight = Input.keyRight
}

function processWeaponSwitch(player) {
    if (Input.weaponSwitch < 0) return
    player.switchWeapon(Input.weaponSwitch)
    Input.weaponSwitch = -1
}

function processWeaponScroll(player) {
    if (Input.weaponScroll === 0) return

    const direction = Input.weaponScroll < 0 ? -1 : 1
    Input.weaponScroll = 0

    const total = player.weapons.length
    for (let step = 1; step <= total; step++) {
        const next = (player.currentWeapon + direction * step + total) % total
        if (player.weapons[next]) {
            player.switchWeapon(next)
            break
        }
    }
}

function processAimInput(player) {
    const rawDelta = Input.pointerLocked ? extractPointerLockedDelta() : extractMouseDelta()

    if (rawDelta !== 0) {
        const cappedDelta = clamp(rawDelta, -MAX_AIM_DELTA, MAX_AIM_DELTA)
        const aimDelta =
            cappedDelta * Settings.aimSensitivity * AIM_INPUT_SCALE * (player.facingLeft ? -1 : 1)
        player.updateAimAngle(aimDelta, player.facingLeft)
    }

    updateFacingDirection(player)
}

function extractPointerLockedDelta() {
    const delta = Input.mouseDeltaY
    Input.mouseDeltaY = 0
    return delta
}

function extractMouseDelta() {
    const delta = Input.mouseY - state.lastMouseY
    state.lastMouseY = Input.mouseY
    return delta
}

function updateFacingDirection(player) {
    const moveDir = Input.keyLeft ? -1 : Input.keyRight ? 1 : 0
    if (moveDir === 0) return

    const newFacingLeft = moveDir < 0

    if (newFacingLeft !== player.facingLeft) {
        player.aimAngle = normalizeAngle(Math.PI - player.aimAngle)
        player.prevAimAngle = player.aimAngle // Skip interpolation on flip
    }

    player.facingLeft = newFacingLeft
}

function processFiring(player) {
    if (!Input.mouseDown || player.dead) return

    const otherPlayers = BotManager.getOtherPlayers(player)
    const result = player.fire()
    if (result?.type === 'rail') {
        Render.addRailShot(result)
        applyHitscanDamage(player, result, otherPlayers)
    }
    if (result?.type === 'shaft') {
        Render.addShaftShot(result)
        applyHitscanDamage(player, result, otherPlayers)
    }
    if (result?.type === 'hitscan') {
        Render.addBulletImpact(result.trace.x, result.trace.y, { radius: 2.5 })
        applyHitscanDamage(player, result, otherPlayers)
    }
    if (result?.type === 'shotgun') {
        for (const pellet of result.pellets) {
            const shot = { startX: result.startX, startY: result.startY, trace: pellet.trace }
            Render.addBulletImpact(shot.trace.x, shot.trace.y, { radius: 2 })
            applyHitscanDamage(player, { ...shot, damage: pellet.damage }, otherPlayers)
        }
    }
    if (result?.type === 'gauntlet') {
        const { x, y } = getWeaponTip(player, GAUNTLET_SPARK_OFFSET)
        Render.addGauntletSpark(x, y)
        applyMeleeDamage(player, result, otherPlayers)
    }
}

function processProjectileHits(player) {
    for (const proj of Projectiles.getAll()) {
        if (!proj.active || !Projectiles.checkPlayerCollision(player, proj)) continue

        const baseDamage = PROJECTILE_WEAPONS.has(proj.type)
            ? DAMAGE[weaponIdFromType(proj.type)]
            : 0
        if (baseDamage > 0) {
            const multiplier =
                proj.ownerId === localPlayer.id && localPlayer.quadDamage ? QUAD_MULTIPLIER : 1
            player.takeDamage(baseDamage * multiplier, proj.ownerId)
        }

        Projectiles.explode(proj)
    }
}

function processItemPickups(player) {
    for (const item of Map.getItems()) {
        if (!item.active) {
            tickItemRespawn(item)
            continue
        }

        if (!isPlayerNearItem(player, item)) continue

        applyItemEffect(player, item)
        item.active = false
        item.respawnTimer = ITEM_DEFS[item.type]?.respawn ?? 300
    }
}

function tickItemRespawn(item) {
    if (--item.respawnTimer <= 0) {
        item.active = true
    }
}

function isPlayerNearItem(player, item) {
    const x = item.col * BRICK_WIDTH + BRICK_WIDTH / 2
    const y = item.row * BRICK_HEIGHT + BRICK_HEIGHT / 2
    return Math.hypot(player.x - x, player.y - y) <= PICKUP_RADIUS
}

function applyItemEffect(player, item) {
    const def = ITEM_DEFS[item.type]
    if (!def) return

    switch (def.kind) {
        case 'health':
            player.giveHealth(def.amount, def.max)
            break
        case 'armor':
            player.giveArmor(def.amount)
            break
        case 'quad':
            player.quadDamage = true
            player.quadTimer = QUAD_DURATION
            break
        case 'weapon':
            player.giveWeapon(def.weaponId, AMMO_PICKUP[def.weaponId] ?? 0)
            break
    }
}

function applyHitscanDamage(attacker, shot, targets) {
    if (!shot?.trace || targets.length === 0) return

    const hit = findHitscanTarget(attacker, shot, targets)
    if (!hit) return

    const multiplier = attacker.quadDamage ? QUAD_MULTIPLIER : 1
    hit.target.takeDamage(shot.damage * multiplier, attacker.id)
}

function applyMeleeDamage(attacker, hit, targets) {
    if (targets.length === 0) return

    const target = findMeleeTarget(attacker, hit, targets)
    if (!target) return

    const multiplier = attacker.quadDamage ? QUAD_MULTIPLIER : 1
    target.takeDamage(hit.damage * multiplier, attacker.id)
}

function findMeleeTarget(attacker, hit, targets) {
    let closest = null
    let closestDistSq = Infinity

    for (const target of targets) {
        if (!target || target.dead || target === attacker) continue

        const dx = target.x - hit.hitX
        const dy = target.y - hit.hitY
        const distSq = dx * dx + dy * dy

        if (distSq > GAUNTLET_PLAYER_RADIUS * GAUNTLET_PLAYER_RADIUS) continue

        if (distSq < closestDistSq) {
            closest = target
            closestDistSq = distSq
        }
    }

    return closest
}

function findHitscanTarget(attacker, shot, targets) {
    const startX = shot.startX
    const startY = shot.startY
    const endX = shot.trace.x
    const endY = shot.trace.y
    const dx = endX - startX
    const dy = endY - startY
    const lenSq = dx * dx + dy * dy || 1

    let closest = null
    let closestT = Infinity

    for (const target of targets) {
        if (!target || target.dead || target === attacker) continue

        const t = ((target.x - startX) * dx + (target.y - startY) * dy) / lenSq
        if (t < 0 || t > 1) continue

        const hitX = startX + dx * t
        const hitY = startY + dy * t
        const distX = target.x - hitX
        const distY = target.y - hitY
        const distSq = distX * distX + distY * distY

        if (distSq > HITSCAN_PLAYER_RADIUS * HITSCAN_PLAYER_RADIUS) continue

        if (t < closestT) {
            closest = target
            closestT = t
        }
    }

    if (!closest) return null
    return { target: closest }
}

function getWeaponTip(player, offset) {
    const x = player.x + Math.cos(player.aimAngle) * offset
    const y = (player.crouch ? player.y + 4 : player.y) + Math.sin(player.aimAngle) * offset
    return { x, y }
}

function weaponIdFromType(type) {
    const map = {
        rocket: WeaponId.ROCKET,
        grenade: WeaponId.GRENADE,
        plasma: WeaponId.PLASMA,
        bfg: WeaponId.BFG,
    }
    return map[type]
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2
    while (angle < -Math.PI) angle += Math.PI * 2
    return angle
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}
