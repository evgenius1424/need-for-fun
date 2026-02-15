import { Sound, WeaponId } from '../core/helpers'
import { Projectiles } from './projectiles'
import { Physics, PhysicsConstants } from './physics'

const HITSCAN_CONFIG = {
    [WeaponId.MACHINE]: { type: 'hitscan', sound: Sound.machinegun },
    [WeaponId.RAIL]: { type: 'rail', sound: Sound.railgun },
    [WeaponId.SHAFT]: { type: 'shaft', sound: Sound.shaft },
}

const PROJECTILE_SOUND = {
    [WeaponId.GRENADE]: Sound.grenade,
    [WeaponId.ROCKET]: Sound.rocket,
    [WeaponId.PLASMA]: Sound.plasma,
    [WeaponId.BFG]: Sound.bfg,
}

const KIND_TO_TYPE = Object.freeze(['rocket', 'grenade', 'plasma', 'bfg'])

export const Weapons = {
    fire(player, weaponId) {
        if (weaponId === WeaponId.GAUNTLET) return fireGauntlet(player)
        if (weaponId === WeaponId.SHOTGUN) return fireShotgun(player)

        if (PROJECTILE_SOUND[weaponId]) return fireProjectile(player, weaponId)

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
            trace: rayTrace(x, y, angle, Physics.getHitscanRange(WeaponId.SHOTGUN)),
            damage: PhysicsConstants.getDamage(WeaponId.SHOTGUN),
        })
    }

    return { type: 'shotgun', pellets, startX: x, startY: y }
}

function fireProjectile(player, weaponId) {
    PROJECTILE_SOUND[weaponId]?.()
    const { aimAngle, id } = player
    const { x, y } = getWeaponOrigin(player)
    const spawn = Physics.computeProjectileSpawn(weaponId, x, y, aimAngle)
    if (!spawn) return null
    const projectileType = KIND_TO_TYPE[(spawn.kind | 0) & 0xff] ?? 'rocket'

    Projectiles.create(projectileType, spawn.x, spawn.y, spawn.velocityX, spawn.velocityY, id)

    return { type: 'projectile', projectileType }
}

function fireHitscan(player, weaponId, cfg) {
    cfg.sound()
    const { aimAngle } = player
    const { x, y } = getWeaponOrigin(player)
    return {
        type: cfg.type,
        trace: rayTrace(x, y, aimAngle, Physics.getHitscanRange(weaponId)),
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
    return Physics.rayTrace(startX, startY, angle, maxDistance)
}
