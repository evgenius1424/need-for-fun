import { Constants, Sound, WeaponConstants, WeaponId } from './helpers'
import { Map } from './map'
import { Projectiles } from './projectiles'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants

function rayTrace(startX, startY, angle, maxDistance) {
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)
    const stepSize = 4

    let currentDistance = 0
    let x = startX
    let y = startY

    while (currentDistance < maxDistance) {
        x += dirX * stepSize
        y += dirY * stepSize
        currentDistance += stepSize

        const colX = Math.floor(x / BRICK_WIDTH)
        const colY = Math.floor(y / BRICK_HEIGHT)

        if (Map.isBrick(colX, colY)) {
            return { hit: true, hitWall: true, x, y, distance: currentDistance }
        }
    }

    return { hit: false, x, y, distance: currentDistance }
}

function fireGauntlet(player) {
    const angle = player.aimAngle
    const range = 50
    const targetX = player.x + Math.cos(angle) * range
    const targetY = player.y + Math.sin(angle) * range

    return {
        type: 'gauntlet',
        damage: WeaponConstants.DAMAGE[WeaponId.GAUNTLET],
        hitX: targetX,
        hitY: targetY,
        angle,
    }
}

function fireMachinegun(player) {
    Sound.machinegun()
    const trace = rayTrace(player.x, player.y, player.aimAngle, 1000)
    return {
        type: 'hitscan',
        trace,
        damage: WeaponConstants.DAMAGE[WeaponId.MACHINE],
        startX: player.x,
        startY: player.y,
    }
}

function fireShotgun(player) {
    Sound.shotgun()
    const pellets = []
    const numPellets = 11
    const spreadAngle = 0.15
    const baseAngle = player.aimAngle

    for (let i = 0; i < numPellets; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * spreadAngle
        const trace = rayTrace(player.x, player.y, angle, 800)
        pellets.push({
            trace,
            damage: WeaponConstants.DAMAGE[WeaponId.SHOTGUN],
        })
    }

    return {
        type: 'shotgun',
        pellets,
        startX: player.x,
        startY: player.y,
    }
}

function fireGrenade(player) {
    Sound.grenade()
    const angle = player.aimAngle
    const speed = WeaponConstants.PROJECTILE_SPEED[WeaponId.GRENADE]

    const spawnOffset = 14
    const velocityX = Math.cos(angle) * speed
    const velocityY = Math.sin(angle) * speed - 2

    Projectiles.create(
        'grenade',
        player.x + Math.cos(angle) * spawnOffset,
        player.y + Math.sin(angle) * spawnOffset,
        velocityX,
        velocityY,
        player.id
    )
    return { type: 'projectile', projectileType: 'grenade' }
}

function fireRocket(player) {
    Sound.rocket()
    const angle = player.aimAngle
    const speed = WeaponConstants.PROJECTILE_SPEED[WeaponId.ROCKET]

    const spawnOffset = 18
    const velocityX = Math.cos(angle) * speed
    const velocityY = Math.sin(angle) * speed

    Projectiles.create(
        'rocket',
        player.x + Math.cos(angle) * spawnOffset,
        player.y + Math.sin(angle) * spawnOffset,
        velocityX,
        velocityY,
        player.id
    )
    return { type: 'projectile', projectileType: 'rocket' }
}

function fireRailgun(player) {
    Sound.railgun()
    const trace = rayTrace(player.x, player.y, player.aimAngle, 2000)
    return {
        type: 'rail',
        trace,
        damage: WeaponConstants.DAMAGE[WeaponId.RAIL],
        startX: player.x,
        startY: player.y,
    }
}

function firePlasma(player) {
    Sound.plasma()
    const angle = player.aimAngle
    const speed = WeaponConstants.PROJECTILE_SPEED[WeaponId.PLASMA]

    const spawnOffset = 12
    const velocityX = Math.cos(angle) * speed
    const velocityY = Math.sin(angle) * speed

    Projectiles.create(
        'plasma',
        player.x + Math.cos(angle) * spawnOffset,
        player.y + Math.sin(angle) * spawnOffset,
        velocityX,
        velocityY,
        player.id
    )
    return { type: 'projectile', projectileType: 'plasma' }
}

function fireShaft(player) {
    Sound.shaft()
    const trace = rayTrace(player.x, player.y, player.aimAngle, 400)
    return {
        type: 'shaft',
        trace,
        damage: WeaponConstants.DAMAGE[WeaponId.SHAFT],
        startX: player.x,
        startY: player.y,
    }
}

function fireBFG(player) {
    Sound.bfg()
    const angle = player.aimAngle
    const speed = WeaponConstants.PROJECTILE_SPEED[WeaponId.BFG]

    const spawnOffset = 12
    const velocityX = Math.cos(angle) * speed
    const velocityY = Math.sin(angle) * speed

    Projectiles.create(
        'bfg',
        player.x + Math.cos(angle) * spawnOffset,
        player.y + Math.sin(angle) * spawnOffset,
        velocityX,
        velocityY,
        player.id
    )
    return { type: 'projectile', projectileType: 'bfg' }
}

const fireFunctions = {
    [WeaponId.GAUNTLET]: fireGauntlet,
    [WeaponId.MACHINE]: fireMachinegun,
    [WeaponId.SHOTGUN]: fireShotgun,
    [WeaponId.GRENADE]: fireGrenade,
    [WeaponId.ROCKET]: fireRocket,
    [WeaponId.RAIL]: fireRailgun,
    [WeaponId.PLASMA]: firePlasma,
    [WeaponId.SHAFT]: fireShaft,
    [WeaponId.BFG]: fireBFG,
}

export const Weapons = {
    fire(player, weaponId) {
        const fn = fireFunctions[weaponId]
        return fn ? fn(player) : null
    },

    getFireRate(weaponId) {
        return WeaponConstants.FIRE_RATE[weaponId] ?? 50
    },

    rayTrace,
}
