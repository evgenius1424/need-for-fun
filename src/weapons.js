import { Constants, Sound, WeaponConstants, WeaponId } from './helpers'
import { Map } from './map'
import { Projectiles } from './projectiles'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants
const { DAMAGE, PROJECTILE_SPEED, FIRE_RATE } = WeaponConstants

const HITSCAN_RANGE = { [WeaponId.MACHINE]: 1000, [WeaponId.RAIL]: 2000, [WeaponId.SHAFT]: 400 }
const SHOTGUN_RANGE = 800
const SHOTGUN_PELLETS = 11
const SHOTGUN_SPREAD = 0.15
const GAUNTLET_RANGE = 50
const GRENADE_LOFT = 2

const PROJECTILE_CONFIG = {
    [WeaponId.GRENADE]: { type: 'grenade', offset: 14, loft: GRENADE_LOFT, sound: Sound.grenade },
    [WeaponId.ROCKET]: { type: 'rocket', offset: 18, loft: 0, sound: Sound.rocket },
    [WeaponId.PLASMA]: { type: 'plasma', offset: 12, loft: 0, sound: Sound.plasma },
    [WeaponId.BFG]: { type: 'bfg', offset: 12, loft: 0, sound: Sound.bfg },
}

const HITSCAN_CONFIG = {
    [WeaponId.MACHINE]: { type: 'hitscan', sound: Sound.machinegun },
    [WeaponId.RAIL]: { type: 'rail', sound: Sound.railgun },
    [WeaponId.SHAFT]: { type: 'shaft', sound: Sound.shaft },
}

export const Weapons = {
    fire(player, weaponId) {
        if (weaponId === WeaponId.GAUNTLET) return fireGauntlet(player)
        if (weaponId === WeaponId.SHOTGUN) return fireShotgun(player)

        const projCfg = PROJECTILE_CONFIG[weaponId]
        if (projCfg) return fireProjectile(player, weaponId, projCfg)

        const hitCfg = HITSCAN_CONFIG[weaponId]
        if (hitCfg) return fireHitscan(player, weaponId, hitCfg)

        return null
    },

    getFireRate: (weaponId) => FIRE_RATE[weaponId] ?? 50,

    rayTrace,
}

function fireGauntlet(player) {
    const { cos, sin } = Math
    const angle = player.aimAngle
    return {
        type: 'gauntlet',
        damage: DAMAGE[WeaponId.GAUNTLET],
        hitX: player.x + cos(angle) * GAUNTLET_RANGE,
        hitY: player.y + sin(angle) * GAUNTLET_RANGE,
        angle,
    }
}

function fireShotgun(player) {
    Sound.shotgun()
    const { x, y, aimAngle } = player
    const pellets = []

    for (let i = 0; i < SHOTGUN_PELLETS; i++) {
        const angle = aimAngle + (Math.random() - 0.5) * SHOTGUN_SPREAD
        pellets.push({
            trace: rayTrace(x, y, angle, SHOTGUN_RANGE),
            damage: DAMAGE[WeaponId.SHOTGUN],
        })
    }

    return { type: 'shotgun', pellets, startX: x, startY: y }
}

function fireProjectile(player, weaponId, cfg) {
    cfg.sound()
    const { x, y, aimAngle, id } = player
    const speed = PROJECTILE_SPEED[weaponId]
    const cos = Math.cos(aimAngle)
    const sin = Math.sin(aimAngle)

    Projectiles.create(
        cfg.type,
        x + cos * cfg.offset,
        y + sin * cfg.offset,
        cos * speed,
        sin * speed - cfg.loft,
        id,
    )

    return { type: 'projectile', projectileType: cfg.type }
}

function fireHitscan(player, weaponId, cfg) {
    cfg.sound()
    const { x, y, aimAngle } = player
    return {
        type: cfg.type,
        trace: rayTrace(x, y, aimAngle, HITSCAN_RANGE[weaponId]),
        damage: DAMAGE[weaponId],
        startX: x,
        startY: y,
    }
}

function rayTrace(startX, startY, angle, maxDistance) {
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)

    let mapX = Math.floor(startX / BRICK_WIDTH)
    let mapY = Math.floor(startY / BRICK_HEIGHT)

    const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX)
    const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY)

    const stepX = dirX < 0 ? -1 : 1
    const stepY = dirY < 0 ? -1 : 1

    let sideDistX =
        dirX < 0
            ? (startX / BRICK_WIDTH - mapX) * deltaDistX
            : (mapX + 1 - startX / BRICK_WIDTH) * deltaDistX

    let sideDistY =
        dirY < 0
            ? (startY / BRICK_HEIGHT - mapY) * deltaDistY
            : (mapY + 1 - startY / BRICK_HEIGHT) * deltaDistY

    let hit = false
    let side = 0
    const maxDistSq = maxDistance * maxDistance

    while (!hit) {
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX
            mapX += stepX
            side = 0
        } else {
            sideDistY += deltaDistY
            mapY += stepY
            side = 1
        }

        const checkX = (mapX + 0.5) * BRICK_WIDTH - startX
        const checkY = (mapY + 0.5) * BRICK_HEIGHT - startY
        if (checkX * checkX + checkY * checkY > maxDistSq) break

        if (Map.isBrick(mapX, mapY)) hit = true
    }

    if (!hit) {
        return {
            hit: false,
            hitWall: false,
            x: startX + dirX * maxDistance,
            y: startY + dirY * maxDistance,
            distance: maxDistance,
        }
    }

    let hitX, hitY, distance
    if (side === 0) {
        hitX = (mapX + (stepX === -1 ? 1 : 0)) * BRICK_WIDTH
        hitY = startY + ((hitX - startX) / dirX) * dirY
        distance = Math.abs((hitX - startX) / dirX)
    } else {
        hitY = (mapY + (stepY === -1 ? 1 : 0)) * BRICK_HEIGHT
        hitX = startX + ((hitY - startY) / dirY) * dirX
        distance = Math.abs((hitY - startY) / dirY)
    }

    return { hit: true, hitWall: true, x: hitX, y: hitY, distance }
}
