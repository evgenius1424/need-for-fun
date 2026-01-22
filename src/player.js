import { GameConstants, Utils, WeaponConstants, WeaponId } from './helpers'
import { Map } from './map'
import { Weapons } from './weapons'

const { trunc } = Utils
const { isBrick } = Map

let nextPlayerId = 0

export class Player {
    id = nextPlayerId++

    x = 0
    y = 0
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

    // Combat properties
    health = GameConstants.MAX_HEALTH
    armor = 0
    dead = false
    respawnTimer = 0

    // Weapon system
    aimAngle = 0
    weapons = [true, true, true, true, true, true, true, true, true]
    ammo = [
        WeaponConstants.AMMO_START[WeaponId.GAUNTLET],
        WeaponConstants.AMMO_START[WeaponId.MACHINE],
        WeaponConstants.AMMO_START[WeaponId.SHOTGUN],
        WeaponConstants.AMMO_START[WeaponId.GRENADE],
        WeaponConstants.AMMO_START[WeaponId.ROCKET],
        WeaponConstants.AMMO_START[WeaponId.RAIL],
        WeaponConstants.AMMO_START[WeaponId.PLASMA],
        WeaponConstants.AMMO_START[WeaponId.SHAFT],
        WeaponConstants.AMMO_START[WeaponId.BFG],
    ]
    currentWeapon = WeaponId.ROCKET
    fireCooldown = 0

    // Powerups
    quadDamage = false
    quadTimer = 0

    setX(newX) {
        if (newX === this.x) return
        this.x = newX
        this.#updateCaches()
    }

    setY(newY) {
        if (newY === this.y) return
        this.y = newY
        this.#updateCaches()
    }

    setXY(newX, newY) {
        if (newX === this.x && newY === this.y) return
        this.x = newX
        this.y = newY
        this.#updateCaches()
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

    #updateCaches() {
        const cacheKeyX = trunc(this.x)
        const cacheKeyY = trunc(this.y)
        if (cacheKeyX === this.#lastCacheX && cacheKeyY === this.#lastCacheY) return
        this.#lastCacheX = cacheKeyX
        this.#lastCacheY = cacheKeyY

        this.#updateCacheOnGround()
        this.#updateCacheBrickOnHead()
        this.#updateCacheBrickCrouchOnHead()
    }

    #updateCacheOnGround() {
        const { x, y } = this
        this.cacheOnGround =
            (isBrick(trunc((x - 9) / 32), trunc((y + 25) / 16)) &&
                !isBrick(trunc((x - 9) / 32), trunc((y + 23) / 16))) ||
            (isBrick(trunc((x + 9) / 32), trunc((y + 25) / 16)) &&
                !isBrick(trunc((x + 9) / 32), trunc((y + 23) / 16))) ||
            (isBrick(trunc((x - 9) / 32), trunc((y + 24) / 16)) &&
                !isBrick(trunc((x - 9) / 32), trunc((y + 8) / 16))) ||
            (isBrick(trunc((x + 9) / 32), trunc((y + 24) / 16)) &&
                !isBrick(trunc((x + 9) / 32), trunc((y + 8) / 16)))
    }

    #updateCacheBrickOnHead() {
        const { x, y } = this
        this.cacheBrickOnHead =
            (isBrick(trunc((x - 9) / 32), trunc((y - 25) / 16)) &&
                !isBrick(trunc((x - 9) / 32), trunc((y - 23) / 16))) ||
            (isBrick(trunc((x + 9) / 32), trunc((y - 25) / 16)) &&
                !isBrick(trunc((x + 9) / 32), trunc((y - 23) / 16))) ||
            (isBrick(trunc((x - 9) / 32), trunc((y - 24) / 16)) &&
                !isBrick(trunc((x - 9) / 32), trunc((y - 8) / 16))) ||
            (isBrick(trunc((x + 9) / 32), trunc((y - 24) / 16)) &&
                !isBrick(trunc((x + 9) / 32), trunc((y - 8) / 16)))
    }

    #updateCacheBrickCrouchOnHead() {
        const { x, y } = this
        this.cacheBrickCrouchOnHead =
            (isBrick(trunc((x - 8) / 32), trunc((y - 9) / 16)) &&
                !isBrick(trunc((x - 8) / 32), trunc((y - 7) / 16))) ||
            (isBrick(trunc((x + 8) / 32), trunc((y - 9) / 16)) &&
                !isBrick(trunc((x + 8) / 32), trunc((y - 7) / 16))) ||
            isBrick(trunc((x - 8) / 32), trunc((y - 23) / 16)) ||
            isBrick(trunc((x + 8) / 32), trunc((y - 23) / 16)) ||
            isBrick(trunc((x - 8) / 32), trunc((y - 16) / 16)) ||
            isBrick(trunc((x + 8) / 32), trunc((y - 16) / 16))
    }

    // Combat methods
    update() {
        if (this.fireCooldown > 0) this.fireCooldown--

        if (this.dead && this.respawnTimer > 0) {
            this.respawnTimer--
            if (this.respawnTimer <= 0) this.respawn()
        }

        if (this.quadDamage && this.quadTimer > 0) {
            this.quadTimer--
            if (this.quadTimer <= 0) this.quadDamage = false
        }
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

    giveHealth(amount, maxHealth = GameConstants.MAX_HEALTH) {
        this.health = Math.min(this.health + amount, maxHealth)
    }

    giveArmor(amount) {
        this.armor = Math.min(this.armor + amount, GameConstants.MAX_ARMOR)
    }

    takeDamage(damage, attackerId) {
        if (this.dead) return

        let actualDamage = damage

        if (attackerId === this.id) {
            actualDamage *= GameConstants.SELF_DAMAGE_REDUCTION
        }

        if (this.armor > 0) {
            let armorDamage = Math.floor(actualDamage * GameConstants.ARMOR_ABSORPTION)
            if (armorDamage > this.armor) armorDamage = this.armor
            this.armor -= armorDamage
            actualDamage -= armorDamage
        }

        this.health -= Math.floor(actualDamage)

        if (this.health <= 0) {
            this.die()
        }
    }

    die() {
        this.dead = true
        this.respawnTimer = GameConstants.RESPAWN_TIME
    }

    respawn() {
        const spawn = Map.getRandomRespawn()
        if (spawn) {
            this.setXY(spawn.col * 32 + 10, spawn.row * 16 - 24)
        }

        this.health = GameConstants.MAX_HEALTH
        this.armor = 0
        this.dead = false
        this.velocityX = 0
        this.velocityY = 0

        this.weapons = [true, true, true, true, true, true, true, true, true]
        this.ammo = [
            WeaponConstants.AMMO_START[WeaponId.GAUNTLET],
            WeaponConstants.AMMO_START[WeaponId.MACHINE],
            WeaponConstants.AMMO_START[WeaponId.SHOTGUN],
            WeaponConstants.AMMO_START[WeaponId.GRENADE],
            WeaponConstants.AMMO_START[WeaponId.ROCKET],
            WeaponConstants.AMMO_START[WeaponId.RAIL],
            WeaponConstants.AMMO_START[WeaponId.PLASMA],
            WeaponConstants.AMMO_START[WeaponId.SHAFT],
            WeaponConstants.AMMO_START[WeaponId.BFG],
        ]
        this.currentWeapon = WeaponId.ROCKET

        this.quadDamage = false
        this.quadTimer = 0
    }

    updateAimAngle(deltaAngle) {
        this.aimAngle += deltaAngle
        while (this.aimAngle > Math.PI) this.aimAngle -= Math.PI * 2
        while (this.aimAngle < -Math.PI) this.aimAngle += Math.PI * 2
    }
}
