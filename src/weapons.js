import { Sound, WeaponId } from './helpers'
import { Map } from './map'
import { Projectiles } from './projectiles'
import { PhysicsConstants } from './engine/core/physics'

const getHitscanRange = (weaponId) => {
    const c = PhysicsConstants
    switch (weaponId) {
        case WeaponId.MACHINE:
            return c.MACHINE_RANGE
        case WeaponId.RAIL:
            return c.RAIL_RANGE
        case WeaponId.SHAFT:
            return c.SHAFT_RANGE
        default:
            return c.MACHINE_RANGE
    }
}

const getProjectileConfig = (weaponId) => {
    const c = PhysicsConstants
    switch (weaponId) {
        case WeaponId.GRENADE:
            return {
                type: 'grenade',
                offset: c.PROJECTILE_OFFSET[WeaponId.GRENADE],
                loft: c.GRENADE_LOFT,
                sound: Sound.grenade,
            }
        case WeaponId.ROCKET:
            return {
                type: 'rocket',
                offset: c.PROJECTILE_OFFSET[WeaponId.ROCKET],
                loft: 0,
                sound: Sound.rocket,
            }
        case WeaponId.PLASMA:
            return {
                type: 'plasma',
                offset: c.PROJECTILE_OFFSET[WeaponId.PLASMA],
                loft: 0,
                sound: Sound.plasma,
            }
        case WeaponId.BFG:
            return {
                type: 'bfg',
                offset: c.PROJECTILE_OFFSET[WeaponId.BFG],
                loft: 0,
                sound: Sound.bfg,
            }
        default:
            return null
    }
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

        const projCfg = getProjectileConfig(weaponId)
        if (projCfg) return fireProjectile(player, weaponId, projCfg)

        const hitCfg = HITSCAN_CONFIG[weaponId]
        if (hitCfg) return fireHitscan(player, weaponId, hitCfg)

        return null
    },

    getFireRate: (weaponId) => PhysicsConstants.getFireRate(weaponId),

    rayTrace,
}

function fireGauntlet(player) {
    const c = PhysicsConstants
    const { cos, sin } = Math
    const angle = player.aimAngle
    const { x, y } = getWeaponOrigin(player)
    return {
        type: 'gauntlet',
        damage: PhysicsConstants.getDamage(WeaponId.GAUNTLET),
        hitX: x + cos(angle) * c.GAUNTLET_RANGE,
        hitY: y + sin(angle) * c.GAUNTLET_RANGE,
        angle,
    }
}

function fireShotgun(player) {
    const c = PhysicsConstants
    Sound.shotgun()
    const { aimAngle } = player
    const { x, y } = getWeaponOrigin(player)
    const pellets = []

    for (let i = 0; i < c.SHOTGUN_PELLETS; i++) {
        const angle = aimAngle + (Math.random() - 0.5) * c.SHOTGUN_SPREAD
        pellets.push({
            trace: rayTrace(x, y, angle, c.SHOTGUN_RANGE),
            damage: PhysicsConstants.getDamage(WeaponId.SHOTGUN),
        })
    }

    return { type: 'shotgun', pellets, startX: x, startY: y }
}

function fireProjectile(player, weaponId, cfg) {
    cfg.sound()
    const { aimAngle, id } = player
    const { x, y } = getWeaponOrigin(player)
    const speed = PhysicsConstants.getProjectileSpeed(weaponId)
    const cos = Math.cos(aimAngle)
    const sin = Math.sin(aimAngle)

    let velocityX = cos * speed
    let velocityY = sin * speed - cfg.loft
    if (cfg.type === 'grenade') {
        const slow = 0.8
        velocityX *= slow
        velocityY = velocityY * slow + 0.9
    }

    Projectiles.create(
        cfg.type,
        x + cos * cfg.offset,
        y + sin * cfg.offset,
        velocityX,
        velocityY,
        id,
    )

    return { type: 'projectile', projectileType: cfg.type }
}

function fireHitscan(player, weaponId, cfg) {
    cfg.sound()
    const { aimAngle } = player
    const { x, y } = getWeaponOrigin(player)
    return {
        type: cfg.type,
        trace: rayTrace(x, y, aimAngle, getHitscanRange(weaponId)),
        damage: PhysicsConstants.getDamage(weaponId),
        startX: x,
        startY: y,
    }
}

function getWeaponOrigin(player) {
    return {
        x: player.x,
        y: player.crouch ? player.y + PhysicsConstants.WEAPON_ORIGIN_CROUCH_LIFT : player.y,
    }
}

function rayTrace(startX, startY, angle, maxDistance) {
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)

    let mapX = Math.floor(startX / PhysicsConstants.TILE_W)
    let mapY = Math.floor(startY / PhysicsConstants.TILE_H)

    const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX)
    const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY)

    const stepX = dirX < 0 ? -1 : 1
    const stepY = dirY < 0 ? -1 : 1

    let sideDistX =
        dirX < 0
            ? (startX / PhysicsConstants.TILE_W - mapX) * deltaDistX
            : (mapX + 1 - startX / PhysicsConstants.TILE_W) * deltaDistX

    let sideDistY =
        dirY < 0
            ? (startY / PhysicsConstants.TILE_H - mapY) * deltaDistY
            : (mapY + 1 - startY / PhysicsConstants.TILE_H) * deltaDistY

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

        const checkX = (mapX + 0.5) * PhysicsConstants.TILE_W - startX
        const checkY = (mapY + 0.5) * PhysicsConstants.TILE_H - startY
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
        hitX = (mapX + (stepX === -1 ? 1 : 0)) * PhysicsConstants.TILE_W
        hitY = startY + ((hitX - startX) / dirX) * dirY
        distance = Math.abs((hitX - startX) / dirX)
    } else {
        hitY = (mapY + (stepY === -1 ? 1 : 0)) * PhysicsConstants.TILE_H
        hitX = startX + ((hitY - startY) / dirY) * dirX
        distance = Math.abs((hitY - startY) / dirY)
    }

    return { hit: true, hitWall: true, x: hitX, y: hitY, distance }
}
