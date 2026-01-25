import { Player } from './player'
import { Map } from './map'
import { Constants, WeaponId } from './helpers'
import { DEFAULT_MODEL, SkinId } from './models'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants

const BOT_NAMES = ['Bandit', 'Striker', 'Hunter', 'Titan', 'Gladiator', 'Viper', 'Shadow', 'Blaze']

const DIFFICULTY = {
    easy: {
        aimSpread: Math.PI / 6,      // ~30 degrees (applied only when firing)
        aimSpeed: 0.05,               // how fast aim tracks target
        reactionTime: 20,             // frames (~333ms at 60fps)
        fireDelay: 90,                // minimum frames between shots (~1.5s)
        jumpChance: 0.03,
    },
    medium: {
        aimSpread: Math.PI / 12,     // ~15 degrees
        aimSpeed: 0.1,
        reactionTime: 12,             // frames (~200ms)
        fireDelay: 60,                // minimum frames between shots (~1s)
        jumpChance: 0.04,
    },
    hard: {
        aimSpread: Math.PI / 24,     // ~7.5 degrees
        aimSpeed: 0.15,
        reactionTime: 6,              // frames (~100ms)
        fireDelay: 40,                // minimum frames between shots (~666ms)
        jumpChance: 0.05,
    },
}

const HALF_PI = Math.PI / 2
const TWO_PI = Math.PI * 2

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= TWO_PI
    while (angle < -Math.PI) angle += TWO_PI
    return angle
}

export class Bot {
    player
    name
    difficulty
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
        this.player = new Player({ model: DEFAULT_MODEL, skin })
        this.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
        this.difficulty = difficulty
        this.config = DIFFICULTY[difficulty] || DIFFICULTY.medium
    }

    update(allPlayers) {
        const { player, config } = this

        if (player.dead) {
            this.clearInputs()
            return
        }

        // Think timer - make decisions at intervals based on difficulty
        if (--this.thinkTimer <= 0) {
            this.thinkTimer = config.reactionTime + Math.floor(Math.random() * 5)
            this.think(allPlayers)
        }

        // Check if stuck
        this.checkStuck()

        // Apply movement
        this.applyMovement()

        // Apply aiming
        this.applyAiming()

        // Note: firing is handled in main.js to process visual effects

        // Weapon switching
        this.considerWeaponSwitch()
    }

    think(allPlayers) {
        // Find closest target
        this.target = this.findTarget(allPlayers)

        if (!this.target) {
            // No target - wander randomly
            this.moveDirection = Math.random() < 0.5 ? -1 : 1
            this.wantsToJump = Math.random() < this.config.jumpChance * 2
            this.wantsToFire = false
            return
        }

        const { player } = this
        const dx = this.target.x - player.x
        const dy = this.target.y - player.y
        const distance = Math.hypot(dx, dy)

        // Movement decision - chase target
        if (Math.abs(dx) > 30) {
            this.moveDirection = dx > 0 ? 1 : -1
        } else {
            // Close enough horizontally, strafe randomly
            this.moveDirection = Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0
        }

        // Jump decision - more aggressive jumping
        const shouldJump =
            // Target is above us
            dy < -BRICK_HEIGHT / 2 ||
            // Obstacle ahead
            this.isBlockedAhead() ||
            // Stuck for a while
            this.stuckTimer > 10 ||
            // Random jump for unpredictability
            Math.random() < this.config.jumpChance

        this.wantsToJump = shouldJump

        // Fire decision - fire if we have line of sight
        this.wantsToFire = distance < 500 && this.hasLineOfSight(this.target)
    }

    findTarget(allPlayers) {
        const { player } = this
        let closest = null
        let closestDist = Infinity

        for (const other of allPlayers) {
            if (!other || other === player || other.dead) continue
            if (other.spawnProtection > 0) continue // Skip spawn-protected

            const dist = Math.hypot(other.x - player.x, other.y - player.y)
            if (dist < closestDist) {
                closestDist = dist
                closest = other
            }
        }

        return closest
    }

    hasLineOfSight(target) {
        const { player } = this
        const dx = target.x - player.x
        const dy = target.y - player.y
        const dist = Math.hypot(dx, dy)
        if (dist < 10) return true

        // Use smaller step size for accuracy
        const stepSize = 8
        const steps = Math.ceil(dist / stepSize)
        const stepX = dx / steps
        const stepY = dy / steps

        for (let i = 1; i < steps; i++) {
            const checkX = player.x + stepX * i
            const checkY = player.y + stepY * i
            const col = Math.floor(checkX / BRICK_WIDTH)
            const row = Math.floor(checkY / BRICK_HEIGHT)

            if (Map.isBrick(col, row)) {
                return false
            }
        }

        return true
    }

    isBlockedAhead() {
        const { player, moveDirection } = this
        if (moveDirection === 0) return false

        const checkX = player.x + moveDirection * BRICK_WIDTH
        const col = Math.floor(checkX / BRICK_WIDTH)
        const row = Math.floor(player.y / BRICK_HEIGHT)

        return Map.isBrick(col, row)
    }

    checkStuck() {
        const { player } = this
        const moved = Math.abs(player.x - this.lastX) > 1 || Math.abs(player.y - this.lastY) > 1

        if (!moved && !player.dead) {
            this.stuckTimer++
            if (this.stuckTimer > 30) {
                // Stuck for too long - try jumping or reversing
                this.wantsToJump = true
                if (this.stuckTimer > 60) {
                    this.moveDirection = -this.moveDirection || 1
                    this.stuckTimer = 0
                }
            }
        } else {
            this.stuckTimer = 0
        }

        this.lastX = player.x
        this.lastY = player.y
    }

    applyMovement() {
        const { player, moveDirection, wantsToJump } = this

        player.keyLeft = moveDirection < 0
        player.keyRight = moveDirection > 0
        player.keyDown = false

        // Pulse jump input instead of holding continuously
        if (this.jumpCooldown > 0) {
            this.jumpCooldown--
            player.keyUp = false
        } else if (wantsToJump && player.isOnGround()) {
            player.keyUp = true
            this.jumpCooldown = 10 // Don't try jumping again for 10 frames
        } else {
            player.keyUp = wantsToJump && !player.isOnGround() // Hold in air for double jump
        }
    }

    applyAiming() {
        const { player, target, config } = this

        if (!target) return

        const dx = target.x - player.x
        const dy = target.y - player.y

        // Calculate angle to target (no spread here - spread applied only when firing)
        let goalAngle = Math.atan2(dy, dx)

        // Determine facing direction
        const facingLeft = dx < 0
        player.facingLeft = facingLeft

        // Clamp goal angle to valid range based on facing direction
        if (facingLeft) {
            // Facing left: angle should be around PI
            if (goalAngle > 0 && goalAngle < HALF_PI) {
                goalAngle = HALF_PI
            } else if (goalAngle < 0 && goalAngle > -HALF_PI) {
                goalAngle = -HALF_PI
            }
        } else {
            // Facing right: angle should be around 0 (between -PI/2 and PI/2)
            goalAngle = Math.max(-HALF_PI, Math.min(HALF_PI, goalAngle))
        }

        // Smooth aim interpolation - don't snap instantly
        const diff = normalizeAngle(goalAngle - player.aimAngle)
        player.aimAngle = normalizeAngle(player.aimAngle + diff * config.aimSpeed)
    }

    applyFiring() {
        const { player, wantsToFire, config } = this

        // Decrease bot's own fire cooldown
        if (this.botFireCooldown > 0) this.botFireCooldown--

        if (!wantsToFire) return null

        // Check both weapon cooldown and bot's fire delay
        if (player.fireCooldown <= 0 && this.botFireCooldown <= 0) {
            this.botFireCooldown = config.fireDelay + Math.floor(Math.random() * 20)

            // Apply spread ONLY when firing, then restore
            const originalAngle = player.aimAngle
            player.aimAngle += (Math.random() - 0.5) * config.aimSpread
            const result = player.fire()
            player.aimAngle = originalAngle

            return result
        }

        return null
    }

    considerWeaponSwitch() {
        const { player, target } = this

        // Don't switch too often
        if (Math.random() > 0.01) return

        const distance = target ? Math.hypot(target.x - player.x, target.y - player.y) : 200

        // Prefer weapons based on distance
        const preferences =
            distance < 50
                ? [WeaponId.GAUNTLET, WeaponId.SHOTGUN, WeaponId.MACHINE]
                : distance < 150
                  ? [WeaponId.SHOTGUN, WeaponId.ROCKET, WeaponId.PLASMA, WeaponId.MACHINE]
                  : distance < 300
                    ? [WeaponId.ROCKET, WeaponId.RAIL, WeaponId.PLASMA, WeaponId.MACHINE]
                    : [WeaponId.RAIL, WeaponId.ROCKET, WeaponId.MACHINE]

        for (const weaponId of preferences) {
            if (player.weapons[weaponId] && this.hasAmmo(weaponId)) {
                player.switchWeapon(weaponId)
                return
            }
        }
    }

    hasAmmo(weaponId) {
        const ammo = this.player.ammo[weaponId]
        return ammo === -1 || ammo > 0
    }

    clearInputs() {
        const { player } = this
        player.keyUp = false
        player.keyDown = false
        player.keyLeft = false
        player.keyRight = false
    }
}
