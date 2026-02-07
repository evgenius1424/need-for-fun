import { Constants, Sound, WeaponId } from './helpers'
import { PhysicsConstants } from './engine/core/physics'
import { Map } from './map'
import { DEFAULT_MODEL, DEFAULT_SKIN } from './models'
import { Weapons } from './weapons'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants
const HALF_HEIGHT = 24
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

    health = PhysicsConstants.MAX_HEALTH
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
        this.x = newX
    }

    setY(newY) {
        this.y = newY
    }

    setXY(newX, newY) {
        this.x = newX
        this.y = newY
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

    giveHealth(amount, max = PhysicsConstants.MAX_HEALTH) {
        this.health = Math.min(this.health + amount, max)
    }

    giveArmor(amount) {
        this.armor = Math.min(this.armor + amount, PhysicsConstants.MAX_ARMOR)
    }

    takeDamage(damage, attackerId) {
        if (this.dead || this.spawnProtection > 0) return

        let actual =
            attackerId === this.id ? damage * PhysicsConstants.SELF_DAMAGE_REDUCTION : damage

        if (this.armor > 0) {
            const armorDamage = Math.min(
                Math.floor(actual * PhysicsConstants.ARMOR_ABSORPTION),
                this.armor,
            )
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
        this.respawnTimer = PhysicsConstants.RESPAWN_TIME
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

        this.health = PhysicsConstants.MAX_HEALTH
        this.armor = 0
        this.dead = false
        this.velocityX = 0
        this.velocityY = 0
        this.weapons = Array(9).fill(true)
        this.ammo = createAmmoArray()
        this.currentWeapon = WeaponId.ROCKET
        this.quadDamage = false
        this.quadTimer = 0
        this.spawnProtection = PhysicsConstants.SPAWN_PROTECTION // ~2 seconds of spawn protection
    }

    updateAimAngle(delta, facingLeft) {
        if (facingLeft) {
            const offset = clamp(normalizeAngle(this.aimAngle - Math.PI) + delta, -HALF_PI, HALF_PI)
            this.aimAngle = normalizeAngle(Math.PI + offset)
        } else {
            this.aimAngle = normalizeAngle(clamp(this.aimAngle + delta, -HALF_PI, HALF_PI))
        }
    }

}

function createAmmoArray() {
    return [
        PhysicsConstants.DEFAULT_AMMO[WeaponId.GAUNTLET],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.MACHINE],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.SHOTGUN],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.GRENADE],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.ROCKET],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.RAIL],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.PLASMA],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.SHAFT],
        PhysicsConstants.DEFAULT_AMMO[WeaponId.BFG],
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
