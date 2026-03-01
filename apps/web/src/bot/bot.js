import { Player } from '../game/player'
import { Map } from '../game/map'
import { WeaponId } from '../core/helpers'
import { DEFAULT_MODEL, MULTIPLAYER_SKINS, SkinId } from '../core/models'
import { PhysicsConstants } from '../game/physics'
import { Projectiles } from '../game/projectiles'

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
        leadFactor: 0.3,
        dodgeChance: 0,
        itemAwareness: 0.3,
        strafeSkill: 0.2,
        retreatThreshold: 15,
    },
    medium: {
        aimSpread: Math.PI / 12,
        aimSpeed: 0.1,
        reactionTime: 12,
        fireDelay: 60,
        jumpChance: 0.04,
        leadFactor: 0.7,
        dodgeChance: 0.4,
        itemAwareness: 0.6,
        strafeSkill: 0.5,
        retreatThreshold: 30,
    },
    hard: {
        aimSpread: Math.PI / 24,
        aimSpeed: 0.15,
        reactionTime: 6,
        fireDelay: 40,
        jumpChance: 0.05,
        leadFactor: 1.0,
        dodgeChance: 0.8,
        itemAwareness: 0.9,
        strafeSkill: 0.8,
        retreatThreshold: 50,
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

const ITEM_PRIORITY = {
    health5: 10,
    health25: 25,
    health50: 45,
    health100: 90,
    armor50: 35,
    armor100: 70,
    quad: 140,
    weapon_machine: 20,
    weapon_shotgun: 28,
    weapon_grenade: 32,
    weapon_rocket: 40,
}

const HIGH_VALUE_ITEMS = new Set(['health100', 'quad', 'armor100'])
const PROJECTILE_WEAPONS = new Set([WeaponId.GRENADE, WeaponId.ROCKET, WeaponId.PLASMA, WeaponId.BFG])
const CLOSE_RANGE_WEAPONS = new Set([WeaponId.GAUNTLET, WeaponId.SHOTGUN, WeaponId.PLASMA])

const FIRE_RANGE = 520
const LOS_STEP_SIZE = 8
const STUCK_JUMP_THRESHOLD = 30
const STUCK_REVERSE_THRESHOLD = 60
const JUMP_COOLDOWN_FRAMES = 10
const DODGE_WINDOW_FRAMES = 20
const DODGE_DISTANCE = 200
const DODGE_HIT_RADIUS = 40
const DODGE_OVERRIDE_MIN = 5
const DODGE_OVERRIDE_MAX = 10
const ITEM_PICKUP_CONFIRM_DISTANCE = 28
const ITEM_RESPAWN_PREP_WINDOW = 120
const WEAPON_SWITCH_COOLDOWN = 30
const RETREAT_DISTANCE = 140
const CLOSE_RANGE = 90
const MEDIUM_RANGE = 260
const PLATFORM_SCAN_RANGE = 10
const PREJUMP_LOOKAHEAD_TILES = 4
const TARGET_STICKINESS_BONUS = 0.2
const ITEM_STICKINESS_BONUS = 0.35
const SELF_SPLASH_AVOID_DISTANCE = 72
const CLOSE_EXPLOSIVE_TRACE_LIMIT = 96
const ROUTE_SCAN_RANGE = 12
const DROP_SCAN_DEPTH = 12
const CLIMB_ROW_SCAN_LIMIT = 8

export class Bot {
    player
    name
    config

    target = null
    itemTarget = null
    combatStyle = 'aggressive'
    thinkTimer = 0
    moveDirection = 0
    wantsToJump = false
    wantsToFire = false
    stuckTimer = 0
    lastX = 0
    lastY = 0
    botFireCooldown = 0
    jumpCooldown = 0
    strafeDirection = 1
    strafeTimer = 0
    dodgeDirection = 0
    dodgeTimer = 0
    lastWeaponRange = 'medium'
    weaponSwitchCooldown = 0
    seekItemsTimer = 0
    aimTarget = null
    targetPosition = null
    routeTarget = null

    constructor(difficulty = 'medium', skin = SkinId.RED) {
        let selectedDifficulty = difficulty
        let controlledPlayer = null
        let selectedSkin = skin

        if (difficulty && typeof difficulty === 'object') {
            selectedDifficulty = difficulty.difficulty ?? 'medium'
            controlledPlayer = difficulty.player ?? null
            selectedSkin = difficulty.skin ?? SkinId.RED
        }

        if (!controlledPlayer && selectedSkin === SkinId.RED) {
            selectedSkin = randomBotSkin()
        }

        this.player = controlledPlayer ?? new Player({ model: DEFAULT_MODEL, skin: selectedSkin })
        this.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
        this.config = DIFFICULTY[selectedDifficulty] ?? DIFFICULTY.medium
        this.strafeDirection = Math.random() < 0.5 ? -1 : 1
    }

    update(allPlayers) {
        if (this.player.dead) {
            this.clearInputs()
            return
        }

        if (this.weaponSwitchCooldown > 0) this.weaponSwitchCooldown--
        if (this.dodgeTimer > 0) this.dodgeTimer--
        else this.dodgeDirection = 0
        if (this.strafeTimer > 0) this.strafeTimer--

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
        const enemies = this.collectEnemies(allPlayers)
        this.target = this.chooseEnemyTarget(enemies)
        this.targetPosition = null
        this.aimTarget = null
        this.routeTarget = null
        this.wantsToFire = false

        this.updateStrafeState()
        this.detectProjectileThreat()

        const shouldSeekItems = this.shouldSeekItems(enemies)
        this.itemTarget = shouldSeekItems ? this.chooseItemTarget() : null

        if (this.target) {
            const distance = distanceBetween(this.player, this.target)
            const engagement = this.getEngagementScore(this.target, enemies)
            this.combatStyle = this.pickCombatStyle(this.target, distance, engagement)
            this.targetPosition = this.resolveTargetPosition(this.target, this.itemTarget)
            this.aimTarget = this.computeAimTarget(this.target)
            this.decideMovement(this.target, this.targetPosition)
            this.decideJump(this.targetPosition)
            this.wantsToFire = this.shouldFireAtTarget(this.target, distance)
        } else if (this.itemTarget) {
            this.combatStyle = 'retreat'
            this.targetPosition = itemWorldPosition(this.itemTarget)
            this.aimTarget = this.targetPosition
            this.decideMovement(null, this.targetPosition)
            this.decideJump(this.targetPosition)
        } else {
            this.combatStyle = 'aggressive'
            this.targetPosition = null
            this.aimTarget = null
            this.wander()
        }
    }

    collectEnemies(allPlayers) {
        return allPlayers.filter((other) => this.isValidTarget(other))
    }

    chooseEnemyTarget(enemies) {
        const visibleCloseEnemies = enemies.filter(
            (enemy) =>
                distanceBetween(this.player, enemy) < MEDIUM_RANGE * 0.85 &&
                this.hasLineOfSight(enemy),
        )
        const pool = visibleCloseEnemies.length ? visibleCloseEnemies : enemies
        let best = null
        let bestScore = -Infinity

        for (const enemy of pool) {
            const distance = distanceBetween(this.player, enemy)
            const weakness = 1 - effectiveHp(enemy) / 200
            const threat = enemy.quadDamage ? 0.6 : 0
            const visibility = this.hasLineOfSight(enemy) ? 0.35 : 0
            const finishingBonus = enemy.health <= 35 ? 0.6 : 0
            const closeEngageBonus = distance < CLOSE_RANGE * 1.5 ? 1.4 : distance < MEDIUM_RANGE ? 0.5 : 0
            const score =
                1 / Math.max(distance, 1) +
                weakness * 0.8 +
                visibility +
                closeEngageBonus +
                finishingBonus -
                threat +
                (enemy === this.target ? TARGET_STICKINESS_BONUS : 0)
            if (score > bestScore) {
                bestScore = score
                best = enemy
            }
        }

        return best
    }

    chooseItemTarget() {
        const items = Map.getItems() ?? []
        let best = null
        let bestScore = -Infinity

        for (const item of items) {
            const score = this.scoreItem(item) + (item === this.itemTarget ? ITEM_STICKINESS_BONUS : 0)
            if (score > bestScore) {
                bestScore = score
                best = item
            }
        }

        return best
    }

    scoreItem(item) {
        if (!item) return -Infinity
        const distance = distanceToPoint(this.player, itemWorldPosition(item))
        if (distance < ITEM_PICKUP_CONFIRM_DISTANCE) return -Infinity

        const isActive = item.active !== false
        let value = ITEM_PRIORITY[item.type] ?? 0
        if (value <= 0) return -Infinity

        if (item.type.startsWith('health')) {
            if (this.player.health >= PhysicsConstants.MAX_HEALTH && item.type !== 'health100') {
                value *= 0.25
            }
            if (this.player.health < 60) value *= 1.8
            if (this.player.health < 30) value *= 2.5
        } else if (item.type.startsWith('armor')) {
            if (this.player.armor >= 100) value *= 0.3
            else if (this.player.armor < 50) value *= 1.7
        } else if (item.type === 'quad') {
            value *= 2.2
        } else if (item.type.startsWith('weapon_')) {
            const weaponId = weaponIdFromItemType(item.type)
            if (weaponId == null) return -Infinity
            if (!this.player.weapons[weaponId]) value *= 1.6
            else if (!this.hasAmmo(weaponId)) value *= 1.2
            else value *= 0.35
        }

        if (!isActive) {
            if (
                this.config.itemAwareness < 0.8 ||
                !HIGH_VALUE_ITEMS.has(item.type) ||
                !Number.isFinite(item.respawnTimer) ||
                item.respawnTimer > ITEM_RESPAWN_PREP_WINDOW
            ) {
                return -Infinity
            }
            value *= 1.5 * (1 - item.respawnTimer / ITEM_RESPAWN_PREP_WINDOW)
        }

        return value / Math.max(distance, 32)
    }

    shouldSeekItems(enemies) {
        if (this.player.quadDamage) return false
        if (this.seekItemsTimer > 0) {
            this.seekItemsTimer--
            return true
        }
        if (this.player.health < 50 || this.player.armor === 0) {
            this.seekItemsTimer = randRange(3, 5)
            return true
        }
        if (!enemies.length) {
            if (Math.random() < this.config.itemAwareness) {
                this.seekItemsTimer = randRange(3, 5)
                return true
            }
            return false
        }

        const nearestEnemy = enemies.reduce(
            (best, enemy) => Math.min(best, distanceBetween(this.player, enemy)),
            Infinity,
        )
        if (nearestEnemy > MEDIUM_RANGE * 1.1 && Math.random() < this.config.itemAwareness) {
            this.seekItemsTimer = randRange(3, 5)
            return true
        }
        return false
    }

    getEngagementScore(target, enemies) {
        if (!target) return 0
        if (this.player.quadDamage) return 10

        const selfHp = effectiveHp(this.player)
        const targetHp = effectiveHp(target)
        const selfWeapon = weaponStrength(this.player.currentWeapon)
        const targetWeapon = weaponStrength(target.currentWeapon)
        const crowdPenalty = Math.max(0, enemies.length - 1) * 0.4

        return (selfHp - targetHp) / 40 + (selfWeapon - targetWeapon) * 0.9 - crowdPenalty
    }

    pickCombatStyle(target, distance, engagementScore) {
        if (!target) return 'aggressive'
        if (this.player.quadDamage) return 'aggressive'

        const retreatThreshold = this.config.retreatThreshold
        if (this.player.health < 15) return 'retreat'
        if (
            this.player.health < retreatThreshold ||
            (engagementScore < -0.9 && this.player.health < 40)
        ) {
            return this.itemTarget ? 'retreat' : 'strafe'
        }

        if (this.player.health + this.player.armor * 0.66 > effectiveHp(target) + 50) {
            return 'aggressive'
        }

        const roll = Math.random()
        if (this.config.strafeSkill < 0.3) {
            if (roll < 0.7) return 'aggressive'
            if (roll < 0.9) return 'strafe'
            return 'retreat'
        }

        if (distance < MEDIUM_RANGE && CLOSE_RANGE_WEAPONS.has(this.player.currentWeapon)) {
            if (roll < 0.3) return 'aggressive'
            if (roll < 0.7) return 'strafe'
            if (roll < 0.9) return 'circle'
            return 'retreat'
        }

        if (roll < 0.3) return 'aggressive'
        if (roll < 0.7) return 'strafe'
        if (roll < 0.9) return 'circle'
        return 'retreat'
    }

    resolveTargetPosition(target, itemTarget) {
        if (this.combatStyle === 'retreat' && itemTarget) {
            return itemWorldPosition(itemTarget)
        }
        if (!target) return itemTarget ? itemWorldPosition(itemTarget) : null
        return { x: target.x, y: target.y }
    }

    computeAimTarget(target) {
        if (!target) return null
        const weaponId = this.player.currentWeapon
        if (!PROJECTILE_WEAPONS.has(weaponId)) {
            return { x: target.x, y: target.y }
        }

        const speed = Math.max(1, PhysicsConstants.getProjectileSpeed(weaponId) || 1)
        const dx = target.x - this.player.x
        const dy = target.y - this.player.y
        const distance = Math.hypot(dx, dy)
        const timeToTarget = distance / speed
        const leadScale = this.config.leadFactor
        const leadX = target.x + target.velocityX * timeToTarget * leadScale
        const leadY = target.y + target.velocityY * timeToTarget * leadScale
        const maxOffset = Math.max(24, distance * 0.5)
        const offsetX = clamp(leadX - target.x, -maxOffset, maxOffset)
        const offsetY = clamp(leadY - target.y, -maxOffset, maxOffset)

        return { x: target.x + offsetX, y: target.y + offsetY }
    }

    shouldFireAtTarget(target, distance) {
        if (!target) return false
        if (distance >= FIRE_RANGE) return false
        if (!this.hasLineOfSight(target)) return false
        if (this.combatStyle === 'retreat' && distance < CLOSE_RANGE && this.player.health < 20) {
            return false
        }
        if (PROJECTILE_WEAPONS.has(this.player.currentWeapon) && this.shouldAvoidExplosiveShot(target, distance)) {
            return false
        }
        return true
    }

    shouldAvoidExplosiveShot(target, distance) {
        if (distance < SELF_SPLASH_AVOID_DISTANCE) return true

        const aimTarget = this.aimTarget ?? target
        const dx = aimTarget.x - this.player.x
        const dy = aimTarget.y - this.player.y
        const traceDistance = Math.min(Math.hypot(dx, dy), CLOSE_EXPLOSIVE_TRACE_LIMIT)
        const angle = Math.atan2(dy, dx)
        const trace = traceDistance > 0 ? rayTraceFromBot(this.player, angle, traceDistance) : null
        return !!trace?.hitWall
    }

    detectProjectileThreat() {
        if (this.config.dodgeChance <= 0 || this.dodgeTimer > 0) return

        for (const projectile of Projectiles.getAll()) {
            if (!projectile?.active || projectile.ownerId === this.player.id) continue
            if (projectile.type === 'grenade') continue

            const dx = projectile.x - this.player.x
            const dy = projectile.y - this.player.y
            const distance = Math.hypot(dx, dy)
            if (distance > DODGE_DISTANCE) continue

            const velocityMag = Math.hypot(projectile.velocityX, projectile.velocityY)
            if (velocityMag < 0.1) continue

            const threat = willProjectilePassNearPlayer(projectile, this.player)
            if (!threat) continue
            if (Math.random() > this.config.dodgeChance) continue

            const perpX = -projectile.velocityY
            const relativeSide = sign(
                perpX * (this.player.x - projectile.x) +
                    projectile.velocityX * (this.player.y - projectile.y),
            )
            this.dodgeDirection = relativeSide || (Math.random() < 0.5 ? -1 : 1)
            this.dodgeTimer = randRange(DODGE_OVERRIDE_MIN, DODGE_OVERRIDE_MAX)
            this.wantsToJump = this.player.isOnGround()
            return
        }
    }

    hasLineOfSight(target) {
        if (!target) return false
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
        const desiredDirection = this.dodgeTimer > 0 ? this.dodgeDirection : this.moveDirection
        this.player.keyLeft = desiredDirection < 0
        this.player.keyRight = desiredDirection > 0
        this.player.keyDown = this.shouldDropDown()

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
        const target = this.aimTarget ?? this.targetPosition ?? this.target
        if (!target) return

        const dx = target.x - this.player.x
        const dy = target.y - this.player.y
        const facingLeft = dx < 0

        this.player.facingLeft = facingLeft
        const goalAngle = this.clampAimAngle(Math.atan2(dy, dx), facingLeft)
        const diff = normalizeAngle(goalAngle - this.player.aimAngle)
        this.player.aimAngle = normalizeAngle(this.player.aimAngle + diff * this.config.aimSpeed)
    }

    considerWeaponSwitch() {
        const distance = this.target ? distanceBetween(this.player, this.target) : Infinity
        const rangeZone = getRangeZone(distance)
        const currentHasAmmo = this.hasAmmo(this.player.currentWeapon)
        const nextWeapon = this.chooseWeaponForContext(distance)

        if (!currentHasAmmo) {
            if (nextWeapon != null && nextWeapon !== this.player.currentWeapon) {
                this.player.switchWeapon(nextWeapon)
                this.lastWeaponRange = rangeZone
                this.weaponSwitchCooldown = WEAPON_SWITCH_COOLDOWN
            }
            return
        }

        if (this.weaponSwitchCooldown > 0) return
        if (rangeZone === this.lastWeaponRange) return

        if (nextWeapon != null && nextWeapon !== this.player.currentWeapon) {
            this.player.switchWeapon(nextWeapon)
            this.weaponSwitchCooldown = WEAPON_SWITCH_COOLDOWN
        }
        this.lastWeaponRange = rangeZone
    }

    chooseWeaponForContext(distance) {
        const prefs = WEAPON_PREFERENCES.find((entry) => distance < entry.maxDist) ?? WEAPON_PREFERENCES.at(-1)
        if (!prefs) return null

        if (
            distance < CLOSE_RANGE &&
            this.player.weapons[WeaponId.GAUNTLET] &&
            this.hasAmmo(WeaponId.GAUNTLET)
        ) {
            return WeaponId.GAUNTLET
        }

        for (const weaponId of prefs.weapons) {
            if (this.player.weapons[weaponId] && this.hasAmmo(weaponId)) {
                return weaponId
            }
        }

        if (distance < MEDIUM_RANGE && this.player.weapons[WeaponId.SHAFT] && this.hasAmmo(WeaponId.SHAFT)) {
            return WeaponId.SHAFT
        }
        if (distance >= MEDIUM_RANGE && this.player.weapons[WeaponId.RAIL] && this.hasAmmo(WeaponId.RAIL)) {
            return WeaponId.RAIL
        }

        for (let weaponId = 0; weaponId < this.player.weapons.length; weaponId++) {
            if (this.player.weapons[weaponId] && this.hasAmmo(weaponId)) return weaponId
        }
        return null
    }

    updateStrafeState() {
        if (this.strafeTimer > 0) return
        this.strafeTimer = randRange(30, 60)
        if (Math.random() < 0.6) {
            this.strafeDirection *= -1
        }
    }

    wander() {
        this.moveDirection = Math.random() < 0.5 ? -1 : 1
        this.wantsToJump = Math.random() < this.config.jumpChance * 2
        this.wantsToFire = false
        this.itemTarget = null
    }

    decideMovement(target, targetPosition) {
        if (!targetPosition) {
            this.moveDirection = 0
            return
        }

        const dx = targetPosition.x - this.player.x
        const distance = Math.abs(dx)
        const directionToTarget = sign(dx)
        const route = this.chooseRouteTarget(targetPosition)
        const routeDirection = route ? sign(route.x - this.player.x) : 0
        this.routeTarget = route

        if (this.dodgeTimer > 0) {
            this.moveDirection = this.dodgeDirection
            return
        }

        switch (this.combatStyle) {
            case 'retreat':
                if (this.itemTarget) {
                    this.moveDirection = routeDirection || directionToTarget
                } else {
                    this.moveDirection = -directionToTarget || this.strafeDirection
                }
                break
            case 'strafe':
                this.moveDirection = this.strafeDirection
                if (distance > MEDIUM_RANGE * 1.25) {
                    this.moveDirection = routeDirection || directionToTarget
                }
                break
            case 'circle':
                if (distance < CLOSE_RANGE * 0.85) {
                    this.moveDirection = -directionToTarget || this.strafeDirection
                } else if (distance > MEDIUM_RANGE) {
                    this.moveDirection = routeDirection || directionToTarget
                } else {
                    this.moveDirection = this.strafeDirection
                }
                break
            case 'aggressive':
            default:
                if (distance > 24) {
                    this.moveDirection = routeDirection || directionToTarget
                } else {
                    this.moveDirection = this.strafeDirection
                }
                break
        }

        if (this.shouldRetreatFrom(target)) {
            this.moveDirection = -sign(target.x - this.player.x) || this.moveDirection
        }
    }

    decideJump(targetPosition) {
        this.wantsToJump = false
        if (!targetPosition) return

        const dy = targetPosition.y - this.player.y
        const verticalThreshold = PhysicsConstants.TILE_H * 1.5
        const route = this.routeTarget ?? this.chooseRouteTarget(targetPosition)
        const platformDirection = route ? sign(route.x - this.player.x) : 0

        if (platformDirection !== 0) {
            this.moveDirection = platformDirection
        }

        this.wantsToJump =
            dy < -PhysicsConstants.TILE_H / 2 ||
            route?.kind === 'climb' ||
            this.shouldPreJump() ||
            this.isBlockedAhead() ||
            this.stuckTimer > 10 ||
            Math.random() < this.config.jumpChance

        if (dy > verticalThreshold && this.player.isOnGround()) {
            this.wantsToJump = false
        }
    }

    shouldPreJump() {
        if (this.moveDirection === 0 || !this.player.isOnGround()) return false

        const dir = this.moveDirection
        const baseCol = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const feetRow = Math.floor((this.player.y + PhysicsConstants.PLAYER_HALF_H) / PhysicsConstants.TILE_H)

        for (let step = 1; step <= PREJUMP_LOOKAHEAD_TILES; step++) {
            const col = baseCol + dir * step
            if (Map.isBrick(col, feetRow) || !Map.isBrick(col, feetRow + 1)) {
                return true
            }
        }

        return false
    }

    shouldDropDown() {
        return this.routeTarget?.kind === 'drop' && Math.abs(this.routeTarget.x - this.player.x) <= PhysicsConstants.TILE_W
    }

    chooseRouteTarget(targetPosition) {
        if (!targetPosition) return null

        const verticalDelta = targetPosition.y - this.player.y
        if (Math.abs(verticalDelta) <= PhysicsConstants.TILE_H * 1.25) {
            return null
        }

        return verticalDelta < 0
            ? this.findClimbRoute(targetPosition)
            : this.findDropRoute(targetPosition)
    }

    findClimbRoute(targetPosition) {
        const baseCol = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const playerRow = Math.floor(this.player.y / PhysicsConstants.TILE_H)
        const targetRow = Math.floor(targetPosition.y / PhysicsConstants.TILE_H)
        let best = null

        for (let offset = 1; offset <= ROUTE_SCAN_RANGE; offset++) {
            for (const dir of preferredDirections(sign(targetPosition.x - this.player.x))) {
                const col = baseCol + dir * offset
                const minRow = Math.max(1, Math.max(targetRow - 2, playerRow - CLIMB_ROW_SCAN_LIMIT))
                for (let row = playerRow; row >= minRow; row--) {
                    if (!this.isStandableCell(col, row - 1)) continue
                    const x = col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2
                    const y = (row + 1) * PhysicsConstants.TILE_H - PhysicsConstants.PLAYER_HALF_H
                    const score =
                        Math.abs(row - targetRow) * 5 +
                        Math.abs(targetPosition.x - x) / PhysicsConstants.TILE_W +
                        offset
                    if (!best || score < best.score) {
                        best = { kind: 'climb', x, y, score }
                    }
                }
            }
        }

        return best
    }

    findDropRoute(targetPosition) {
        const playerCol = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const playerRow = Math.floor(this.player.y / PhysicsConstants.TILE_H)
        const targetRow = Math.floor(targetPosition.y / PhysicsConstants.TILE_H)
        let best = null

        for (let offset = 1; offset <= ROUTE_SCAN_RANGE; offset++) {
            for (const dir of preferredDirections(sign(targetPosition.x - this.player.x))) {
                const col = playerCol + dir * offset
                if (!this.isWalkableHeadColumn(col, playerRow)) continue
                if (Map.isBrick(col, playerRow + 1)) continue

                const landingRow = this.findLandingRow(col, playerRow + 1)
                if (landingRow == null) continue
                const x = col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2
                const y = landingRow * PhysicsConstants.TILE_H - PhysicsConstants.PLAYER_HALF_H
                const score =
                    Math.abs(landingRow - targetRow) * 4 +
                    Math.abs(targetPosition.x - x) / PhysicsConstants.TILE_W +
                    offset
                if (!best || score < best.score) {
                    best = { kind: 'drop', x, y, score }
                }
            }
        }

        return best
    }

    shouldRetreatFrom(target) {
        if (!target || this.player.quadDamage) return false
        if (this.combatStyle === 'retreat') return true
        return (
            this.player.health + this.player.armor * 0.66 <
                effectiveHp(target) - RETREAT_DISTANCE / 6 &&
            this.player.health < 40
        )
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

    isStandableCell(col, row) {
        return (
            !Map.isBrick(col, row) &&
            !Map.isBrick(col, row + 1) &&
            Map.isBrick(col, row + 2)
        )
    }

    isWalkableHeadColumn(col, row) {
        return !Map.isBrick(col, row) && !Map.isBrick(col, row - 1)
    }

    findLandingRow(col, startRow) {
        for (let row = startRow; row < Math.min(Map.getRows() - 2, startRow + DROP_SCAN_DEPTH); row++) {
            if (this.isStandableCell(col, row - 1)) {
                return row + 1
            }
        }
        return null
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
        this.itemTarget = null
        this.target = null
        this.targetPosition = null
        this.aimTarget = null
        this.routeTarget = null
        this.dodgeDirection = 0
        this.dodgeTimer = 0
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

function randRange(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1))
}

function sign(value) {
    return value < 0 ? -1 : value > 0 ? 1 : 0
}

function distanceBetween(a, b) {
    return Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0))
}

function distanceToPoint(a, point) {
    return Math.hypot((point.x ?? 0) - (a.x ?? 0), (point.y ?? 0) - (a.y ?? 0))
}

function effectiveHp(player) {
    return (player?.health ?? 0) + (player?.armor ?? 0) * 0.66
}

function weaponStrength(weaponId) {
    switch (weaponId) {
        case WeaponId.GAUNTLET:
            return 0.7
        case WeaponId.MACHINE:
            return 1.0
        case WeaponId.SHOTGUN:
            return 1.5
        case WeaponId.GRENADE:
            return 1.4
        case WeaponId.ROCKET:
            return 1.8
        case WeaponId.RAIL:
            return 2.0
        case WeaponId.PLASMA:
            return 1.7
        case WeaponId.SHAFT:
            return 1.9
        case WeaponId.BFG:
            return 2.2
        default:
            return 1
    }
}

function itemWorldPosition(item) {
    return {
        x: item.col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2,
        y: item.row * PhysicsConstants.TILE_H + PhysicsConstants.TILE_H / 2,
    }
}

function weaponIdFromItemType(type) {
    switch (type) {
        case 'weapon_machine':
            return WeaponId.MACHINE
        case 'weapon_shotgun':
            return WeaponId.SHOTGUN
        case 'weapon_grenade':
            return WeaponId.GRENADE
        case 'weapon_rocket':
            return WeaponId.ROCKET
        default:
            return null
    }
}

function getRangeZone(distance) {
    if (distance < CLOSE_RANGE) return 'close'
    if (distance < MEDIUM_RANGE) return 'medium'
    return 'far'
}

function willProjectilePassNearPlayer(projectile, player) {
    let bestDistanceSq = Infinity
    const speedX = projectile.velocityX ?? 0
    const speedY = projectile.velocityY ?? 0

    for (let frame = 1; frame <= DODGE_WINDOW_FRAMES; frame++) {
        const futureX = projectile.x + speedX * frame
        const futureY = projectile.y + speedY * frame
        const dx = player.x - futureX
        const dy = player.y - futureY
        bestDistanceSq = Math.min(bestDistanceSq, dx * dx + dy * dy)
    }

    return bestDistanceSq <= DODGE_HIT_RADIUS * DODGE_HIT_RADIUS
}

function randomBotSkin() {
    return MULTIPLAYER_SKINS[randInt(MULTIPLAYER_SKINS.length)] ?? SkinId.RED
}

function rayTraceFromBot(player, angle, maxDistance) {
    const originY = player.crouch
        ? player.y + PhysicsConstants.WEAPON_ORIGIN_CROUCH_LIFT
        : player.y
    let x = player.x
    let y = originY
    const step = Math.max(4, LOS_STEP_SIZE)

    for (let dist = step; dist <= maxDistance; dist += step) {
        x = player.x + Math.cos(angle) * dist
        y = originY + Math.sin(angle) * dist
        const col = Math.floor(x / PhysicsConstants.TILE_W)
        const row = Math.floor(y / PhysicsConstants.TILE_H)
        if (Map.isBrick(col, row)) {
            return { hitWall: true, x, y }
        }
    }

    return { hitWall: false, x, y }
}

function preferredDirections(primary) {
    return primary >= 0 ? [1, -1] : [-1, 1]
}
