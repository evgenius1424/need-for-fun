import { WeaponId } from '../../helpers'
import { PhysicsConstants } from '../core/physics'

export const PLAYER_HEIGHT = PhysicsConstants.PLAYER_HALF_H * 2

export const PLAYER_SCALE_X = PhysicsConstants.TILE_W / PLAYER_HEIGHT
export const PLAYER_SCALE_Y = 1
export const WEAPON_SCALE = 0.85
export const BG_TILE_SCALE = 0.7

export const ANIMATION = {
    walk: { refresh: 2, loop: true },
    crouch: { refresh: 3, loop: true },
    die: { refresh: 2, loop: false },
}

export const PROJECTILE_COLORS = {
    rocket: 0xff6600,
    plasma: 0x00ffff,
    grenade: 0x666666,
    bfg: 0x00ff00,
}

export const ROCKET_SMOKE_INTERVAL = 4
export const GRENADE_SMOKE_INTERVAL = 6
export const SMOKE_MAX_AGE = 32

export const WEAPON_ITEM_MAP = {
    weapon_machine: WeaponId.MACHINE,
    weapon_shotgun: WeaponId.SHOTGUN,
    weapon_grenade: WeaponId.GRENADE,
    weapon_rocket: WeaponId.ROCKET,
}
