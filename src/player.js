import { Constants, GameConstants, Sound, Utils, WeaponConstants, WeaponId } from './helpers'
import { Map } from './map'
import { DEFAULT_MODEL, DEFAULT_SKIN } from './models'
import { Weapons } from './weapons'

const { trunc } = Utils
const { BRICK_WIDTH, BRICK_HEIGHT } = Constants
const { isBrick, getRows } = Map
const { MAX_HEALTH, MAX_ARMOR, SELF_DAMAGE_REDUCTION, ARMOR_ABSORPTION, RESPAWN_TIME } =
    GameConstants
const { AMMO_START } = WeaponConstants

const HALF_WIDTH = 9
const HALF_HEIGHT = 24
const CROUCH_HALF_HEIGHT = 8
const GROUND_PROBE = 25
const HEAD_PROBE = 25
const CROUCH_HEAD_PROBE = 9
const HALF_PI = Math.PI / 2
const TWO_PI = Math.PI * 2

let nextPlayerId = 0

export class Player {
    id = nextPlayerId++
    model = DEFAULT_MODEL
    skin = DEFAULT_SKIN

    x = 0
    y = 0
    prevX = 0
    prevY = 0
    velocityX = 0
    velocityY = 0

    keyUp = false
    keyDown = false
    keyLeft = false
    keyRight = false
    crouch = false

    doublejumpCountdown = 0
    speedJump = 0

    cacheOnGround = false
    cacheBrickOnHead = false
    cacheBrickCrouchOnHead = false
    #lastCacheX = NaN
    #lastCacheY = NaN

    health = MAX_HEALTH
    armor = 0
    dead = false
    respawnTimer = 0
    spawnProtection = 0

    aimAngle = 0
    prevAimAngle = 0
    facingLeft = false
    weapons = Array(9).fill(true)
    ammo = createAmmoArray()
    currentWeapon = WeaponId.ROCKET
    fireCooldown = 0

    quadDamage = false
    quadTimer = 0

    constructor(options = {}) {
        if (options.model) this.model = options.model
        if (options.skin) this.skin = options.skin
    }

    setX(newX) {
        if (newX !== this.x) {
            this.x = newX
            this.#updateCaches()
        }
    }

    setY(newY) {
        if (newY !== this.y) {
            this.y = newY
            this.#updateCaches()
        }
    }

    setXY(newX, newY) {
        if (newX !== this.x || newY !== this.y) {
            this.x = newX
            this.y = newY
            this.#updateCaches()
        }
    }

    isOnGround() {
        return this.cacheOnGround
    }
    isBrickOnHead() {
        return this.cacheBrickOnHead
    }
    isBrickCrouchOnHead() {
        return this.cacheBrickCrouchOnHead
    }

    update() {
        if (this.fireCooldown > 0) this.fireCooldown--
        if (this.spawnProtection > 0) this.spawnProtection--

        if (this.dead && this.respawnTimer > 0) {
            this.respawnTimer--
        }

        if (this.quadDamage && --this.quadTimer <= 0) {
            this.quadDamage = false
        }
    }

    // Check and handle respawn for local player
    checkRespawn() {
        if (this.dead && this.respawnTimer <= 0) {
            this.respawn()
            return true
        }
        return false
    }

    canFire() {
        if (this.dead || this.fireCooldown > 0) return false
        const ammo = this.ammo[this.currentWeapon]
        return ammo === -1 || ammo > 0
    }

    fire() {
        if (!this.canFire()) return null

        if (this.ammo[this.currentWeapon] !== -1) {
            this.ammo[this.currentWeapon]--
        }

        this.fireCooldown = Weapons.getFireRate(this.currentWeapon)
        return Weapons.fire(this, this.currentWeapon)
    }

    switchWeapon(weaponId) {
        if (weaponId >= 0 && weaponId < 9 && this.weapons[weaponId]) {
            this.currentWeapon = weaponId
        }
    }

    giveWeapon(weaponId, ammo) {
        this.weapons[weaponId] = true
        if (this.ammo[weaponId] !== -1) {
            this.ammo[weaponId] += ammo
        }
    }

    giveHealth(amount, max = MAX_HEALTH) {
        this.health = Math.min(this.health + amount, max)
    }

    giveArmor(amount) {
        this.armor = Math.min(this.armor + amount, MAX_ARMOR)
    }

    takeDamage(damage, attackerId) {
        if (this.dead || this.spawnProtection > 0) return

        let actual = attackerId === this.id ? damage * SELF_DAMAGE_REDUCTION : damage

        if (this.armor > 0) {
            const armorDamage = Math.min(Math.floor(actual * ARMOR_ABSORPTION), this.armor)
            this.armor -= armorDamage
            actual -= armorDamage
        }

        const rounded = Math.floor(actual)
        this.health -= rounded

        if (this.health <= 0) {
            this.die()
        } else if (rounded > 0) {
            Sound.pain(this.model, rounded)
        }
    }

    die() {
        this.dead = true
        this.respawnTimer = RESPAWN_TIME
        Sound.death(this.model)
    }

    respawn() {
        const spawn = Map.getRandomRespawn()
        if (spawn) {
            this.setXY(spawn.col * BRICK_WIDTH + 10, spawn.row * BRICK_HEIGHT - HALF_HEIGHT)
        }
        this.prevX = this.x
        this.prevY = this.y
        this.prevAimAngle = this.aimAngle

        this.health = MAX_HEALTH
        this.armor = 0
        this.dead = false
        this.velocityX = 0
        this.velocityY = 0
        this.weapons = Array(9).fill(true)
        this.ammo = createAmmoArray()
        this.currentWeapon = WeaponId.ROCKET
        this.quadDamage = false
        this.quadTimer = 0
        this.spawnProtection = 120 // ~2 seconds of spawn protection
    }

    updateAimAngle(delta, facingLeft) {
        if (facingLeft) {
            const offset = clamp(normalizeAngle(this.aimAngle - Math.PI) + delta, -HALF_PI, HALF_PI)
            this.aimAngle = normalizeAngle(Math.PI + offset)
        } else {
            this.aimAngle = normalizeAngle(clamp(this.aimAngle + delta, -HALF_PI, HALF_PI))
        }
    }

    #updateCaches() {
        const cacheX = trunc(this.x)
        const cacheY = trunc(this.y)
        if (cacheX === this.#lastCacheX && cacheY === this.#lastCacheY) return
        this.#lastCacheX = cacheX
        this.#lastCacheY = cacheY

        const { x, y } = this
        const colL = trunc((x - HALF_WIDTH) / BRICK_WIDTH)
        const colR = trunc((x + HALF_WIDTH) / BRICK_WIDTH)
        const colLNarrow = trunc((x - CROUCH_HALF_HEIGHT) / BRICK_WIDTH)
        const colRNarrow = trunc((x + CROUCH_HALF_HEIGHT) / BRICK_WIDTH)

        this.cacheOnGround = this.#checkGround(colL, colR, y)
        this.cacheBrickOnHead = this.#checkHead(colL, colR, y)
        this.cacheBrickCrouchOnHead = this.#checkCrouchHead(colLNarrow, colRNarrow, y)
    }

    #checkGround(colL, colR, y) {
        const rowProbe = trunc((y + GROUND_PROBE) / BRICK_HEIGHT)

        // Treat map bottom boundary as ground
        if (rowProbe >= getRows()) return true

        const rowInside = trunc((y + HALF_HEIGHT - 1) / BRICK_HEIGHT)
        const rowBody = trunc((y + CROUCH_HALF_HEIGHT) / BRICK_HEIGHT)

        return (
            (isBrick(colL, rowProbe) && !isBrick(colL, rowInside)) ||
            (isBrick(colR, rowProbe) && !isBrick(colR, rowInside)) ||
            (isBrick(colL, trunc((y + HALF_HEIGHT) / BRICK_HEIGHT)) && !isBrick(colL, rowBody)) ||
            (isBrick(colR, trunc((y + HALF_HEIGHT) / BRICK_HEIGHT)) && !isBrick(colR, rowBody))
        )
    }

    #checkHead(colL, colR, y) {
        const rowProbe = trunc((y - HEAD_PROBE) / BRICK_HEIGHT)

        // Treat map top boundary as ceiling
        if (rowProbe < 0) return true

        const rowInside = trunc((y - HALF_HEIGHT + 1) / BRICK_HEIGHT)
        const rowBody = trunc((y - CROUCH_HALF_HEIGHT) / BRICK_HEIGHT)

        return (
            (isBrick(colL, rowProbe) && !isBrick(colL, rowInside)) ||
            (isBrick(colR, rowProbe) && !isBrick(colR, rowInside)) ||
            (isBrick(colL, trunc((y - HALF_HEIGHT) / BRICK_HEIGHT)) && !isBrick(colL, rowBody)) ||
            (isBrick(colR, trunc((y - HALF_HEIGHT) / BRICK_HEIGHT)) && !isBrick(colR, rowBody))
        )
    }

    #checkCrouchHead(colL, colR, y) {
        const rowProbe = trunc((y - CROUCH_HEAD_PROBE) / BRICK_HEIGHT)
        const rowInside = trunc((y - 7) / BRICK_HEIGHT)

        return (
            (isBrick(colL, rowProbe) && !isBrick(colL, rowInside)) ||
            (isBrick(colR, rowProbe) && !isBrick(colR, rowInside)) ||
            isBrick(colL, trunc((y - 23) / BRICK_HEIGHT)) ||
            isBrick(colR, trunc((y - 23) / BRICK_HEIGHT)) ||
            isBrick(colL, trunc((y - 16) / BRICK_HEIGHT)) ||
            isBrick(colR, trunc((y - 16) / BRICK_HEIGHT))
        )
    }
}

function createAmmoArray() {
    return [
        AMMO_START[WeaponId.GAUNTLET],
        AMMO_START[WeaponId.MACHINE],
        AMMO_START[WeaponId.SHOTGUN],
        AMMO_START[WeaponId.GRENADE],
        AMMO_START[WeaponId.ROCKET],
        AMMO_START[WeaponId.RAIL],
        AMMO_START[WeaponId.PLASMA],
        AMMO_START[WeaponId.SHAFT],
        AMMO_START[WeaponId.BFG],
    ]
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= TWO_PI
    while (angle < -Math.PI) angle += TWO_PI
    return angle
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}
