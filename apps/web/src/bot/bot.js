import { Player } from '../game/player'
import { Map } from '../game/map'
import { WeaponId } from '../core/helpers'
import { DEFAULT_MODEL, SkinId } from '../core/models'
import { PhysicsConstants } from '../game/physics'

const HALF_PI = Math.PI / 2
const TWO_PI = Math.PI * 2

const BOT_NAMES = ['Bandit', 'Striker', 'Hunter', 'Titan', 'Gladiator', 'Viper', 'Shadow', 'Blaze']

const DIFFICULTY = {
    easy: {
        aimSpread: Math.PI / 6,
        aimSpeed: 0.05,
        reactionTime: 20,
        fireDelay: 90,
        jumpChance: 0.03,
    },
    medium: {
        aimSpread: Math.PI / 12,
        aimSpeed: 0.1,
        reactionTime: 12,
        fireDelay: 60,
        jumpChance: 0.04,
    },
    hard: {
        aimSpread: Math.PI / 24,
        aimSpeed: 0.15,
        reactionTime: 6,
        fireDelay: 40,
        jumpChance: 0.05,
    },
}

const WEAPON_PREFERENCES = [
    { maxDist: 50, weapons: [WeaponId.GAUNTLET, WeaponId.SHOTGUN, WeaponId.MACHINE] },
    {
        maxDist: 150,
        weapons: [WeaponId.SHOTGUN, WeaponId.ROCKET, WeaponId.PLASMA, WeaponId.MACHINE],
    },
    { maxDist: 300, weapons: [WeaponId.ROCKET, WeaponId.RAIL, WeaponId.PLASMA, WeaponId.MACHINE] },
    { maxDist: Infinity, weapons: [WeaponId.RAIL, WeaponId.ROCKET, WeaponId.MACHINE] },
]

const CHASE_THRESHOLD = 30
const FIRE_RANGE = 500
const LOS_STEP_SIZE = 8
const STUCK_JUMP_THRESHOLD = 30
const STUCK_REVERSE_THRESHOLD = 60
const JUMP_COOLDOWN_FRAMES = 10
const WEAPON_SWITCH_CHANCE = 0.01

export class Bot {
    player
    name
    config

    target = null
    thinkTimer = 0
    moveDirection = 0
    wantsToJump = false
    wantsToFire = false
    stuckTimer = 0
    lastX = 0
    lastY = 0
    botFireCooldown = 0
    jumpCooldown = 0

    constructor(difficulty = 'medium', skin = SkinId.RED) {
        let selectedDifficulty = difficulty
        let controlledPlayer = null
        let selectedSkin = skin

        if (difficulty && typeof difficulty === 'object') {
            selectedDifficulty = difficulty.difficulty ?? 'medium'
            controlledPlayer = difficulty.player ?? null
            selectedSkin = difficulty.skin ?? SkinId.RED
        }

        this.player = controlledPlayer ?? new Player({ model: DEFAULT_MODEL, skin: selectedSkin })
        this.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
        this.config = DIFFICULTY[selectedDifficulty] ?? DIFFICULTY.medium
    }

    update(allPlayers) {
        if (this.player.dead) {
            this.clearInputs()
            return
        }

        if (--this.thinkTimer <= 0) {
            this.thinkTimer = this.config.reactionTime + randInt(5)
            this.think(allPlayers)
        }

        this.checkStuck()
        this.applyMovement()
        this.applyAiming()
        this.considerWeaponSwitch()
    }

    applyFiring() {
        if (this.botFireCooldown > 0) this.botFireCooldown--
        if (!this.wantsToFire) return null
        if (this.player.fireCooldown > 0 || this.botFireCooldown > 0) return null

        this.botFireCooldown = this.config.fireDelay + randInt(20)

        const originalAngle = this.player.aimAngle
        this.player.aimAngle += (Math.random() - 0.5) * this.config.aimSpread
        const result = this.player.fire()
        this.player.aimAngle = originalAngle

        return result
    }

    think(allPlayers) {
        this.target = this.findTarget(allPlayers)

        if (!this.target) {
            this.wander()
            return
        }

        const dx = this.target.x - this.player.x
        const dy = this.target.y - this.player.y
        const distance = Math.hypot(dx, dy)

        this.decideMovement(dx)
        this.decideJump(dy)
        this.wantsToFire = distance < FIRE_RANGE && this.hasLineOfSight(this.target)
    }

    findTarget(allPlayers) {
        let closest = null
        let closestDist = Infinity

        for (const other of allPlayers) {
            if (!this.isValidTarget(other)) continue

            const dist = Math.hypot(other.x - this.player.x, other.y - this.player.y)
            if (dist < closestDist) {
                closestDist = dist
                closest = other
            }
        }

        return closest
    }

    hasLineOfSight(target) {
        const dx = target.x - this.player.x
        const dy = target.y - this.player.y
        const dist = Math.hypot(dx, dy)
        if (dist < 10) return true

        const steps = Math.ceil(dist / LOS_STEP_SIZE)
        const stepX = dx / steps
        const stepY = dy / steps

        for (let i = 1; i < steps; i++) {
            const col = Math.floor((this.player.x + stepX * i) / PhysicsConstants.TILE_W)
            const row = Math.floor((this.player.y + stepY * i) / PhysicsConstants.TILE_H)
            if (Map.isBrick(col, row)) return false
        }

        return true
    }

    checkStuck() {
        const moved =
            Math.abs(this.player.x - this.lastX) > 1 || Math.abs(this.player.y - this.lastY) > 1

        if (!moved && !this.player.dead) {
            this.stuckTimer++
            if (this.stuckTimer > STUCK_JUMP_THRESHOLD) {
                this.wantsToJump = true
            }
            if (this.stuckTimer > STUCK_REVERSE_THRESHOLD) {
                this.moveDirection = -this.moveDirection || 1
                this.stuckTimer = 0
            }
        } else {
            this.stuckTimer = 0
        }

        this.lastX = this.player.x
        this.lastY = this.player.y
    }

    applyMovement() {
        this.player.keyLeft = this.moveDirection < 0
        this.player.keyRight = this.moveDirection > 0
        this.player.keyDown = false

        if (this.jumpCooldown > 0) {
            this.jumpCooldown--
            this.player.keyUp = false
        } else if (this.wantsToJump && this.player.isOnGround()) {
            this.player.keyUp = true
            this.jumpCooldown = JUMP_COOLDOWN_FRAMES
        } else {
            this.player.keyUp = this.wantsToJump && !this.player.isOnGround()
        }
    }

    applyAiming() {
        if (!this.target) return

        const dx = this.target.x - this.player.x
        const dy = this.target.y - this.player.y
        const facingLeft = dx < 0

        this.player.facingLeft = facingLeft
        const goalAngle = this.clampAimAngle(Math.atan2(dy, dx), facingLeft)
        const diff = normalizeAngle(goalAngle - this.player.aimAngle)
        this.player.aimAngle = normalizeAngle(this.player.aimAngle + diff * this.config.aimSpeed)
    }

    considerWeaponSwitch() {
        if (Math.random() > WEAPON_SWITCH_CHANCE) return

        const distance = this.target
            ? Math.hypot(this.target.x - this.player.x, this.target.y - this.player.y)
            : 200

        const prefs = WEAPON_PREFERENCES.find((p) => distance < p.maxDist)
        for (const weaponId of prefs.weapons) {
            if (this.player.weapons[weaponId] && this.hasAmmo(weaponId)) {
                this.player.switchWeapon(weaponId)
                return
            }
        }
    }

    wander() {
        this.moveDirection = Math.random() < 0.5 ? -1 : 1
        this.wantsToJump = Math.random() < this.config.jumpChance * 2
        this.wantsToFire = false
    }

    decideMovement(dx) {
        if (Math.abs(dx) > CHASE_THRESHOLD) {
            this.moveDirection = dx > 0 ? 1 : -1
        } else {
            this.moveDirection = Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0
        }
    }

    decideJump(dy) {
        this.wantsToJump =
            dy < -PhysicsConstants.TILE_H / 2 ||
            this.isBlockedAhead() ||
            this.stuckTimer > 10 ||
            Math.random() < this.config.jumpChance
    }

    isBlockedAhead() {
        if (this.moveDirection === 0) return false
        const col = Math.floor(
            (this.player.x + this.moveDirection * PhysicsConstants.TILE_W) /
                PhysicsConstants.TILE_W,
        )
        const row = Math.floor(this.player.y / PhysicsConstants.TILE_H)
        return Map.isBrick(col, row)
    }

    isValidTarget(other) {
        return other && other !== this.player && !other.dead && other.spawnProtection <= 0
    }

    hasAmmo(weaponId) {
        const ammo = this.player.ammo[weaponId]
        return ammo === -1 || ammo > 0
    }

    clampAimAngle(angle, facingLeft) {
        if (facingLeft) {
            if (angle > 0 && angle < HALF_PI) return HALF_PI
            if (angle < 0 && angle > -HALF_PI) return -HALF_PI
            return angle
        }
        return clamp(angle, -HALF_PI, HALF_PI)
    }

    clearInputs() {
        this.player.keyUp = false
        this.player.keyDown = false
        this.player.keyLeft = false
        this.player.keyRight = false
        this.wantsToJump = false
        this.wantsToFire = false
        this.moveDirection = 0
    }
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= TWO_PI
    while (angle < -Math.PI) angle += TWO_PI
    return angle
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}

function randInt(max) {
    return Math.floor(Math.random() * max)
}
