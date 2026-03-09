import { Player } from '../game/player'
import { Map } from '../game/map'
import { WeaponId } from '../core/helpers'
import { DEFAULT_MODEL, MULTIPLAYER_SKINS, SkinId } from '../core/models'
import { Physics, PhysicsConstants } from '../game/physics'
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
const PROJECTILE_WEAPONS = new Set([
    WeaponId.GRENADE,
    WeaponId.ROCKET,
    WeaponId.PLASMA,
    WeaponId.BFG,
])
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
const LAST_KNOWN_DECAY = 180
const MEMORY_CONFIDENCE_DECAY = {
    easy: 0.1,
    medium: 0.075,
    hard: 0.055,
}
const MEMORY_CONFIDENCE_DECAY_VISIBLE = {
    easy: 0.015,
    medium: 0.01,
    hard: 0.008,
}
const MEMORY_MIN_CONFIDENCE = 0.1
const MEMORY_INFER_FRAMES = {
    easy: 6,
    medium: 9,
    hard: 12,
}
const TARGET_COMMIT_FRAMES = {
    easy: [8, 16],
    medium: [12, 24],
    hard: [18, 32],
}
const PLAN_COMMIT_FRAMES = {
    easy: [7, 14],
    medium: [10, 20],
    hard: [14, 26],
}
const MOVEMENT_COMMIT_FRAMES = {
    easy: [5, 10],
    medium: [8, 16],
    hard: [10, 20],
}
const REACTION_MISTAKE_CHANCE = {
    easy: 0.18,
    medium: 0.09,
    hard: 0.04,
}
const REACTION_MISTAKE_DURATION = {
    easy: [3, 8],
    medium: [2, 6],
    hard: [1, 4],
}
const FIRE_HESITATION_CHANCE = {
    easy: 0.2,
    medium: 0.12,
    hard: 0.06,
}
const FIRE_HESITATION_DURATION = {
    easy: [2, 6],
    medium: [1, 4],
    hard: [1, 3],
}
const REMEMBERED_TARGET_BIAS = {
    easy: 0.16,
    medium: 0.1,
    hard: 0.06,
}
const STRESS_RESILIENCE = {
    easy: 0.01,
    medium: 0.014,
    hard: 0.018,
}
const CONFIDENCE_RECOVERY = {
    easy: 0.004,
    medium: 0.006,
    hard: 0.008,
}
const DAMAGE_STRESS_GAIN = 0.22
const DAMAGE_CONFIDENCE_LOSS = 0.16
const PURSUIT_STICKY_TICKS = 36
const ROUTE_COMMIT_FRAMES = {
    easy: [20, 36],
    medium: [24, 42],
    hard: [28, 50],
}
const ROUTE_REACHED_DISTANCE = PhysicsConstants.TILE_W * 0.8
const TACTICAL_ANCHOR_SEARCH_RADIUS = PhysicsConstants.TILE_W * 10
const INTENTION_COMMIT_FRAMES = {
    easy: [10, 20],
    medium: [14, 28],
    hard: [18, 34],
}
const AIM_SETTLE_THRESHOLD = {
    easy: 0.16,
    medium: 0.12,
    hard: 0.08,
}
const SOUND_AWARENESS_RANGE = {
    easy: 280,
    medium: 360,
    hard: 460,
}
const SOUND_AWARENESS_VERTICAL = PhysicsConstants.TILE_H * 3.5
const SOUND_MEMORY_CONFIDENCE_FLOOR = {
    easy: 0.14,
    medium: 0.2,
    hard: 0.27,
}
const SOUND_MEMORY_NOISE = {
    easy: 110,
    medium: 85,
    hard: 65,
}

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
    lastKnownEnemyPosition = null
    lastKnownEnemyTimer = 0
    enemyMemory = new globalThis.Map()
    personality = null
    mentalState = null
    targetCommitTimer = 0
    planCommitTimer = 0
    movementCommitTimer = 0
    reactionDelayTimer = 0
    fireHesitationTimer = 0
    committedTargetId = null
    committedPlanTargetId = null
    committedMoveDirection = 0
    perceivedTargetConfidence = 0
    targetPerception = null
    pursuitCommitTimer = 0
    routeCommitTimer = 0
    navigationContext = null
    currentIntention = 'fight'
    combatPrimitive = 'pressure'
    intentionCommitTimer = 0

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
        this.personality = createPersonalityProfile(this.config)
        this.mentalState = {
            confidence: clamp(0.58 + this.personality.aimDiscipline * 0.35, 0.3, 0.95),
            stress: 0.1,
            lastDamageTimer: 0,
            recentSuccess: 0,
            recentFailure: 0,
        }
    }

    update(allPlayers, navigationContext = null) {
        if (this.player.dead) {
            this.clearInputs()
            return
        }
        this.navigationContext = navigationContext

        if (this.weaponSwitchCooldown > 0) this.weaponSwitchCooldown--
        if (this.dodgeTimer > 0) this.dodgeTimer--
        else this.dodgeDirection = 0
        if (this.strafeTimer > 0) this.strafeTimer--
        if (this.targetCommitTimer > 0) this.targetCommitTimer--
        if (this.planCommitTimer > 0) this.planCommitTimer--
        if (this.movementCommitTimer > 0) this.movementCommitTimer--
        if (this.reactionDelayTimer > 0) this.reactionDelayTimer--
        if (this.fireHesitationTimer > 0) this.fireHesitationTimer--
        if (this.pursuitCommitTimer > 0) this.pursuitCommitTimer--
        if (this.routeCommitTimer > 0) this.routeCommitTimer--
        if (this.intentionCommitTimer > 0) this.intentionCommitTimer--
        this.updateMentalState()

        if (--this.thinkTimer <= 0) {
            this.thinkTimer = this.config.reactionTime + randInt(5)
            this.think(allPlayers, navigationContext)
        }

        this.checkStuck()
        this.applyMovement()
        this.applyAiming()
        this.considerWeaponSwitch()
    }

    onDamaged(fromPlayer) {
        this.thinkTimer = 0
        this.mentalState.lastDamageTimer = 90
        this.mentalState.stress = clamp(this.mentalState.stress + DAMAGE_STRESS_GAIN, 0, 1)
        this.mentalState.confidence = clamp(this.mentalState.confidence - DAMAGE_CONFIDENCE_LOSS, 0, 1)
        this.mentalState.recentFailure = clamp(this.mentalState.recentFailure + 0.2, 0, 2)
        this.mentalState.recentSuccess = clamp(this.mentalState.recentSuccess - 0.12, 0, 2)

        if (fromPlayer) {
            this.updateEnemyMemory(fromPlayer, this.hasLineOfSight(fromPlayer))
            const memory = this.enemyMemory.get(fromPlayer.id)
            if (memory) memory.wasDamagedByRecently = 90
        }

        if (fromPlayer && !this.target) {
            const memory = this.enemyMemory.get(fromPlayer.id)
            if (memory) {
                this.lastKnownEnemyPosition = { x: memory.lastSeenX, y: memory.lastSeenY }
                this.lastKnownEnemyTimer = LAST_KNOWN_DECAY
            } else {
                this.lastKnownEnemyPosition = { x: fromPlayer.x, y: fromPlayer.y }
                this.lastKnownEnemyTimer = LAST_KNOWN_DECAY
            }
        }
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

    think(allPlayers, navigationContext = null) {
        this.navigationContext = navigationContext ?? this.navigationContext
        const enemies = this.collectEnemies(allPlayers)
        const perception = this.buildPerception(enemies)
        this.targetPerception = perception
        this.target = this.chooseEnemyTarget(enemies, perception)
        this.targetPosition = null
        this.aimTarget = null
        this.routeTarget = null
        this.wantsToFire = false

        this.updateStrafeState()
        this.detectProjectileThreat()
        this.maybeInjectReactionDelay(perception)

        this.syncLegacyLastKnown(perception)

        if (this.reactionDelayTimer > 0) {
            this.wantsToFire = false
            this.aimTarget = this.lastKnownEnemyPosition ?? null
            if (!this.targetPosition && this.lastKnownEnemyPosition) {
                this.targetPosition = this.lastKnownEnemyPosition
            }
            if (!this.targetPosition) this.wander()
            return
        }

        const shouldSeekItems = this.shouldSeekItems(enemies)
        this.itemTarget = shouldSeekItems ? this.chooseItemTarget() : null

        if (this.target) {
            const distance = distanceBetween(this.player, this.target)
            const engagement = this.getEngagementScore(this.target, enemies)
            this.maybeUpdatePlan(this.target, distance, engagement, perception)
            this.decideMovement(this.target, this.targetPosition)
            this.decideJump(this.targetPosition)
            this.wantsToFire = this.shouldFireAtTarget(this.target, distance, perception)
        } else if (this.lastKnownEnemyTimer > 0 && this.lastKnownEnemyPosition) {
            this.combatStyle = 'aggressive'
            this.targetPosition = this.lastKnownEnemyPosition
            this.aimTarget = this.lastKnownEnemyPosition
            this.decideMovement(null, this.targetPosition)
            this.decideJump(this.targetPosition)
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

    chooseEnemyTarget(enemies, perception = null) {
        const commitCandidate = this.getCommittedTarget(enemies, perception)
        if (commitCandidate) return commitCandidate

        const visibleEnemies =
            perception?.visibleEnemies ?? enemies.filter((enemy) => this.canObserveEnemy(enemy))
        const rememberedEnemies = perception?.rememberedEnemies ?? []
        const preferRemembered =
            rememberedEnemies.length > 0 &&
            visibleEnemies.length > 0 &&
            Math.random() < REMEMBERED_TARGET_BIAS[this.getDifficultyKey()] * (1 + this.mentalState.stress * 0.6)

        if (preferRemembered) {
            const biased = this.pickRememberedTargetCandidate(rememberedEnemies, enemies)
            if (biased) {
                this.commitTarget(biased.id)
                return biased
            }
        }

        const visibleCloseEnemies = enemies.filter(
            (enemy) =>
                distanceBetween(this.player, enemy) < MEDIUM_RANGE * 0.85 &&
                this.canObserveEnemy(enemy),
        )
        const pool = visibleCloseEnemies.length ? visibleCloseEnemies : enemies
        let best = null
        let bestScore = -Infinity

        for (const enemy of pool) {
            const visible = this.canObserveEnemy(enemy)
            const memory = this.enemyMemory.get(enemy.id)
            const inferred = this.inferEnemyPosition(memory)
            const perceivedPos = visible ? enemy : inferred
            if (!visible && !perceivedPos) continue

            const distance = distanceToPoint(this.player, perceivedPos ?? enemy)
            const weakness = 1 - effectiveHp(enemy) / 200
            const threat = enemy.quadDamage ? 0.6 : 0
            const visibility = visible ? 0.35 : 0
            const confidence = memory?.confidence ?? (visible ? 1 : 0.2)
            const finishingBonus = enemy.health <= 35 ? 0.6 : 0
            const closeEngageBonus =
                distance < CLOSE_RANGE * 1.5 ? 1.4 : distance < MEDIUM_RANGE ? 0.5 : 0
            const score =
                1 / Math.max(distance, 1) +
                weakness * 0.8 +
                visibility * 1.3 +
                closeEngageBonus +
                finishingBonus -
                threat +
                confidence * 0.6 +
                (enemy === this.target ? TARGET_STICKINESS_BONUS : 0)
            if (score > bestScore) {
                bestScore = score
                best = enemy
            }
        }

        if (best) this.commitTarget(best.id)
        return best
    }

    chooseItemTarget() {
        const items = Map.getItems() ?? []
        let best = null
        let bestScore = -Infinity

        for (const item of items) {
            const score =
                this.scoreItem(item) + (item === this.itemTarget ? ITEM_STICKINESS_BONUS : 0)
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
        const observedEnemy = enemies.find((enemy) => this.canObserveEnemy(enemy))
        if (observedEnemy) {
            const dist = distanceBetween(this.player, observedEnemy)
            if (dist < MEDIUM_RANGE * 1.8) return false
        }
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
        if (
            nearestEnemy > MEDIUM_RANGE * (1.05 + this.personality.greedBias * 0.2) &&
            Math.random() < this.config.itemAwareness * (0.8 + this.personality.greedBias * 0.4)
        ) {
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

        const retreatThreshold =
            this.config.retreatThreshold + this.personality.panicThreshold * 12 + this.mentalState.stress * 14
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

        const roll = Math.random() + this.personality.aggressionBias * 0.12 - this.mentalState.stress * 0.08
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
        if (this.canObserveEnemy(target)) return { x: target.x, y: target.y }

        const memory = this.enemyMemory.get(target.id)
        const inferred = this.inferEnemyPosition(memory)
        if (inferred && (!this.hasLineOfSight(target) || (memory?.confidence ?? 0) < 0.7)) {
            return inferred
        }
        return { x: target.x, y: target.y }
    }

    computeAimTarget(target) {
        if (!target) return null
        const memory = this.enemyMemory.get(target.id)
        const inferred = this.inferEnemyPosition(memory)
        const canSee = this.canObserveEnemy(target)
        const anchor = canSee ? target : inferred ?? target
        const weaponId = this.player.currentWeapon
        if (!PROJECTILE_WEAPONS.has(weaponId)) {
            return { x: anchor.x, y: anchor.y }
        }

        const speed = Math.max(1, PhysicsConstants.getProjectileSpeed(weaponId) || 1)
        const dx = anchor.x - this.player.x
        const dy = anchor.y - this.player.y
        const distance = Math.hypot(dx, dy)
        const timeToTarget = distance / speed
        const leadScale =
            this.config.leadFactor * (0.85 + this.personality.aimDiscipline * 0.35) * (0.8 + this.mentalState.confidence * 0.25)
        const velocityX = canSee ? target.velocityX : memory?.lastSeenVelocityX ?? 0
        const velocityY = canSee ? target.velocityY : memory?.lastSeenVelocityY ?? 0
        const leadX = anchor.x + velocityX * timeToTarget * leadScale
        const leadY = anchor.y + velocityY * timeToTarget * leadScale
        const maxOffset = Math.max(24, distance * 0.5)
        const offsetX = clamp(leadX - anchor.x, -maxOffset, maxOffset)
        const offsetY = clamp(leadY - anchor.y, -maxOffset, maxOffset)

        return { x: anchor.x + offsetX, y: anchor.y + offsetY }
    }

    shouldFireAtTarget(target, distance, perception = null) {
        if (!target) return false
        if (distance >= FIRE_RANGE) return false
        if (!this.hasLineOfSight(target)) return false
        const confidence = this.getTargetConfidence(target, perception)
        if (this.combatStyle === 'retreat' && distance < CLOSE_RANGE && this.player.health < 20) {
            return false
        }
        if (this.fireHesitationTimer > 0) return false
        if (confidence < 0.45 && this.shouldHesitateBeforeFire()) {
            this.fireHesitationTimer = randRange(...FIRE_HESITATION_DURATION[this.getDifficultyKey()])
            return false
        }
        if (this.combatPrimitive === 'closeGap' && distance > this.getPreferredWeaponDistance() * 1.15) {
            return false
        }
        if (
            this.player.currentWeapon === WeaponId.RAIL &&
            (this.combatPrimitive === 'peek' || this.combatPrimitive === 'hold') &&
            !this.isAimAligned(target, AIM_SETTLE_THRESHOLD[this.getDifficultyKey()])
        ) {
            return false
        }
        const shotWindowScore = this.getShotWindowScore(target, distance, confidence)
        const shotThreshold = this.getDifficultyKey() === 'easy' ? 0.5 : this.getDifficultyKey() === 'hard' ? 0.34 : 0.42
        if (shotWindowScore < shotThreshold) return false
        if (
            PROJECTILE_WEAPONS.has(this.player.currentWeapon) &&
            this.shouldAvoidExplosiveShot(target, distance)
        ) {
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
        const originY = this.player.crouch
            ? this.player.y + PhysicsConstants.WEAPON_ORIGIN_CROUCH_LIFT
            : this.player.y
        const trace =
            traceDistance > 0
                ? Physics.rayTrace(this.player.x, originY, angle, traceDistance)
                : null
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
            if (!this.hasProjectileLineThreat(projectile)) continue
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

        const angle = Math.atan2(dy, dx)
        const trace = Physics.rayTrace(this.player.x, this.player.y, angle, dist)
        return !trace.hitWall || trace.distance >= dist - LOS_STEP_SIZE
    }

    hasProjectileLineThreat(projectile) {
        const dx = this.player.x - projectile.x
        const dy = this.player.y - projectile.y
        const distance = Math.hypot(dx, dy)
        if (distance < 1) return true

        const angle = Math.atan2(dy, dx)
        const trace = Physics.rayTrace(projectile.x, projectile.y, angle, distance)
        return !trace.hitWall || trace.distance >= distance - LOS_STEP_SIZE
    }

    checkStuck() {
        const moved =
            Math.abs(this.player.x - this.lastX) > 1 || Math.abs(this.player.y - this.lastY) > 1

        if (!moved && !this.player.dead) {
            this.stuckTimer++
            if (this.stuckTimer > STUCK_JUMP_THRESHOLD) {
                const escapeDirection = this.findJumpEscapeDirection(this.targetPosition ?? this.target)
                if (escapeDirection !== 0 && this.player.isOnGround()) {
                    // In low ceilings/pits, side-step to a jumpable column instead of bunny-jumping in place.
                    this.moveDirection = escapeDirection
                    this.wantsToJump = false
                } else {
                    this.wantsToJump = true
                }
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

        const angularDistance = Math.abs(diff)
        const steadiness = this.personality.aimDiscipline * (0.7 + this.mentalState.confidence * 0.4)
        const stressPenalty = 1 - this.mentalState.stress * 0.35
        const speed = this.config.aimSpeed * (0.7 + steadiness * 0.45) * (1 + angularDistance * 0.4) * stressPenalty
        const jitterScale = clamp(1.35 - steadiness + this.mentalState.stress * 0.8, 0.45, 1.8)
        const jitter = (Math.random() - 0.5) * this.config.aimSpread * 0.15 * jitterScale

        this.player.aimAngle = normalizeAngle(
            this.player.aimAngle + diff * Math.min(speed, 0.4) + jitter,
        )
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
        const prefs =
            WEAPON_PREFERENCES.find((entry) => distance < entry.maxDist) ??
            WEAPON_PREFERENCES.at(-1)
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

        if (
            distance < MEDIUM_RANGE &&
            this.player.weapons[WeaponId.SHAFT] &&
            this.hasAmmo(WeaponId.SHAFT)
        ) {
            return WeaponId.SHAFT
        }
        if (
            distance >= MEDIUM_RANGE &&
            this.player.weapons[WeaponId.RAIL] &&
            this.hasAmmo(WeaponId.RAIL)
        ) {
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
        const items = Map.getItems()?.filter((i) => i.active !== false) ?? []
        const highValue = items
            .filter((i) => HIGH_VALUE_ITEMS.has(i.type))
            .sort(
                (a, b) =>
                    distanceToPoint(this.player, itemWorldPosition(a)) -
                    distanceToPoint(this.player, itemWorldPosition(b)),
            )

        if (highValue.length) {
            const patrol = highValue[0]
            this.targetPosition = itemWorldPosition(patrol)
            this.decideMovement(null, this.targetPosition)
            this.decideJump(this.targetPosition)
            return
        }

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
        const route = this.chooseRouteTarget(targetPosition, target)
        const routeDirection = route ? sign(route.x - this.player.x) : 0
        this.routeTarget = route
        const shouldPursue =
            !!target &&
            (this.pursuitCommitTimer > 0 || !this.hasLineOfSight(target)) &&
            this.combatStyle !== 'retreat'

        if (this.dodgeTimer > 0) {
            this.moveDirection = this.dodgeDirection
            return
        }

        if (shouldPursue) {
            this.moveDirection = routeDirection || directionToTarget || this.strafeDirection
            if (this.moveDirection !== 0) this.committedMoveDirection = this.moveDirection
            return
        }

        const primitiveDirection = this.resolvePrimitiveMoveDirection(
            target,
            directionToTarget,
            routeDirection,
            distance,
        )
        if (primitiveDirection != null) {
            this.moveDirection = primitiveDirection
        } else {

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
        }

        if (this.shouldRetreatFrom(target)) {
            this.moveDirection = -sign(target.x - this.player.x) || this.moveDirection
        }

        if (this.dodgeTimer <= 0) {
            if (this.movementCommitTimer > 0) {
                this.moveDirection = this.committedMoveDirection || this.moveDirection
            } else {
                this.committedMoveDirection = this.moveDirection
                this.movementCommitTimer = randRange(...MOVEMENT_COMMIT_FRAMES[this.getDifficultyKey()])
            }
        }
    }

    decideJump(targetPosition) {
        this.wantsToJump = false
        if (!targetPosition) return

        const dy = targetPosition.y - this.player.y
        const verticalThreshold = PhysicsConstants.TILE_H * 1.5
        const route = this.routeTarget ?? this.chooseRouteTarget(targetPosition, this.target)
        const platformDirection = route ? sign(route.x - this.player.x) : 0
        const lowCeiling = this.hasLowCeilingForJump()
        if (lowCeiling && this.player.isOnGround()) {
            const escapeDirection = this.findJumpEscapeDirection(targetPosition)
            if (escapeDirection !== 0) {
                this.moveDirection = escapeDirection
                this.wantsToJump = false
                return
            }
        }

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

        if (lowCeiling && this.wantsToJump && this.player.isOnGround()) {
            this.wantsToJump = false
        }

        if (dy > verticalThreshold && this.player.isOnGround()) {
            this.wantsToJump = false
        }
    }

    shouldPreJump() {
        if (this.moveDirection === 0 || !this.player.isOnGround()) return false

        const dir = this.moveDirection
        const baseCol = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const feetRow = Math.floor(
            (this.player.y + PhysicsConstants.PLAYER_HALF_H) / PhysicsConstants.TILE_H,
        )

        for (let step = 1; step <= PREJUMP_LOOKAHEAD_TILES; step++) {
            const col = baseCol + dir * step
            if (Map.isBrick(col, feetRow) || !Map.isBrick(col, feetRow + 1)) {
                return true
            }
        }

        return false
    }

    shouldDropDown() {
        return (
            this.routeTarget?.kind === 'drop' &&
            Math.abs(this.routeTarget.x - this.player.x) <= PhysicsConstants.TILE_W
        )
    }

    chooseRouteTarget(targetPosition, target = null) {
        if (!targetPosition) return null

        if (
            this.routeTarget &&
            this.routeCommitTimer > 0 &&
            !this.hasReachedRouteTarget(this.routeTarget) &&
            !this.shouldInvalidateRouteTarget(this.routeTarget, targetPosition)
        ) {
            return this.routeTarget
        }

        const verticalDelta = targetPosition.y - this.player.y
        let route =
            Math.abs(verticalDelta) > PhysicsConstants.TILE_H * 1.25
                ? verticalDelta < 0
                    ? this.findClimbRoute(targetPosition)
                    : this.findDropRoute(targetPosition)
                : null

        const tacticalRoute = this.chooseTacticalAnchorRoute(targetPosition, target)
        if (tacticalRoute && (!route || tacticalRoute.score < route.score)) {
            route = tacticalRoute
        }

        if (route) {
            this.routeCommitTimer = randRange(...ROUTE_COMMIT_FRAMES[this.getDifficultyKey()])
        }
        return route
    }

    findClimbRoute(targetPosition) {
        const baseCol = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const playerRow = Math.floor(this.player.y / PhysicsConstants.TILE_H)
        const targetRow = Math.floor(targetPosition.y / PhysicsConstants.TILE_H)
        let best = null

        for (let offset = 1; offset <= ROUTE_SCAN_RANGE; offset++) {
            for (const dir of preferredDirections(sign(targetPosition.x - this.player.x))) {
                const col = baseCol + dir * offset
                const minRow = Math.max(
                    1,
                    Math.max(targetRow - 2, playerRow - CLIMB_ROW_SCAN_LIMIT),
                )
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

    chooseTacticalAnchorRoute(targetPosition, target) {
        const anchors = this.navigationContext?.anchors
        if (!anchors?.length) return null

        let best = null
        let bestScore = Infinity
        const maxRange = TACTICAL_ANCHOR_SEARCH_RADIUS

        for (const anchor of anchors) {
            const distToSelf = distanceToPoint(this.player, anchor)
            if (distToSelf > maxRange) continue

            const distToGoal = distanceToPoint(anchor, targetPosition)
            if (distToGoal > maxRange * 1.25) continue

            const score = this.scoreAnchorRoute(anchor, targetPosition, target)
            if (score < bestScore) {
                bestScore = score
                best = {
                    kind: `anchor:${anchor.kind}`,
                    x: anchor.x,
                    y: anchor.y,
                    score,
                }
            }
        }

        return best
    }

    scoreAnchorRoute(anchor, targetPosition, target) {
        const tileW = PhysicsConstants.TILE_W
        const travelTiles =
            (distanceToPoint(this.player, anchor) + distanceToPoint(anchor, targetPosition)) /
            tileW
        const verticalTiles = Math.abs(anchor.y - this.player.y) / PhysicsConstants.TILE_H
        const goalDeltaTiles = Math.abs(anchor.y - targetPosition.y) / PhysicsConstants.TILE_H
        const exposureRisk = this.estimateExposureRisk(anchor, target)
        const coverScore = this.estimateCoverScore(anchor)
        const healthState = effectiveHp(this.player)
        const weak = healthState < 70
        const fastBias = this.personality.aggressionBias * 0.4 + this.personality.chaseBias * 0.4
        const speedWeight = clamp(1.15 - fastBias, 0.72, 1.2)
        const safetyWeight = weak ? 3.6 : 2.1
        const valueBias = (anchor.value ?? 0.6) * (this.itemTarget ? 1.1 : 0.6)

        return (
            travelTiles * speedWeight +
            verticalTiles * 1.4 +
            goalDeltaTiles * 0.9 +
            exposureRisk * safetyWeight -
            coverScore * (weak ? 2.4 : 1.1) -
            valueBias
        )
    }

    estimateExposureRisk(point, target) {
        const openness = 1 - this.estimateCoverScore(point)
        if (!target) return openness * 0.8

        const dx = target.x - point.x
        const dy = target.y - point.y
        const dist = Math.hypot(dx, dy)
        if (dist < 1) return openness

        const angle = Math.atan2(dy, dx)
        const trace = Physics.rayTrace(point.x, point.y, angle, dist)
        const blocked = trace?.hitWall && trace.distance < dist - LOS_STEP_SIZE
        const lineRisk = blocked ? 0.2 : 1
        return clamp(openness * 0.55 + lineRisk * 0.75, 0, 1)
    }

    estimateCoverScore(point) {
        const col = Math.floor(point.x / PhysicsConstants.TILE_W)
        const row = Math.floor(point.y / PhysicsConstants.TILE_H)
        let solid = 0
        let samples = 0

        for (let dc = -2; dc <= 2; dc++) {
            for (let dr = -2; dr <= 1; dr++) {
                samples++
                if (Map.isBrick(col + dc, row + dr)) solid++
            }
        }

        if (samples <= 0) return 0
        return clamp(solid / samples, 0, 1)
    }

    hasReachedRouteTarget(routeTarget) {
        return distanceToPoint(this.player, routeTarget) <= ROUTE_REACHED_DISTANCE
    }

    shouldInvalidateRouteTarget(routeTarget, goalPosition) {
        if (!routeTarget || !goalPosition) return true
        const routeToGoal = distanceToPoint(routeTarget, goalPosition)
        const selfToGoal = distanceToPoint(this.player, goalPosition)
        if (routeToGoal > selfToGoal * 1.5) return true
        if (this.stuckTimer > STUCK_JUMP_THRESHOLD) return true
        return false
    }

    shouldRetreatFrom(target) {
        if (!target || this.player.quadDamage) return false
        if (this.combatStyle === 'retreat') return true
        return (
            this.player.health + this.player.armor * 0.66 <
                effectiveHp(target) - RETREAT_DISTANCE / 6 && this.player.health < 40
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
        return !Map.isBrick(col, row) && !Map.isBrick(col, row + 1) && Map.isBrick(col, row + 2)
    }

    isWalkableHeadColumn(col, row) {
        return !Map.isBrick(col, row) && !Map.isBrick(col, row - 1)
    }

    findLandingRow(col, startRow) {
        for (
            let row = startRow;
            row < Math.min(Map.getRows() - 2, startRow + DROP_SCAN_DEPTH);
            row++
        ) {
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

    updateMentalState() {
        if (this.mentalState.lastDamageTimer > 0) this.mentalState.lastDamageTimer--
        this.mentalState.stress = clamp(
            this.mentalState.stress - STRESS_RESILIENCE[this.getDifficultyKey()] * (this.mentalState.lastDamageTimer > 0 ? 0.35 : 1),
            0,
            1,
        )
        this.mentalState.confidence = clamp(
            this.mentalState.confidence + CONFIDENCE_RECOVERY[this.getDifficultyKey()] * (1 - this.mentalState.stress * 0.5),
            0,
            1,
        )
    }

    buildPerception(enemies) {
        const visibleEnemies = []
        const rememberedEnemies = []
        const liveIds = new Set()

        for (const enemy of enemies) {
            liveIds.add(enemy.id)
            const visible = this.canObserveEnemy(enemy)
            if (visible) visibleEnemies.push(enemy)
            const sensed = !visible && this.canSenseEnemy(enemy)
            this.updateEnemyMemory(enemy, visible, sensed)

            const memory = this.enemyMemory.get(enemy.id)
            if (memory && memory.confidence > MEMORY_MIN_CONFIDENCE) {
                rememberedEnemies.push({
                    enemyId: enemy.id,
                    confidence: memory.confidence,
                    inferredPosition: this.inferEnemyPosition(memory),
                    visible,
                })
            }
        }

        for (const [enemyId, memory] of this.enemyMemory.entries()) {
            if (liveIds.has(enemyId)) {
                if (memory.wasDamagedByRecently > 0) memory.wasDamagedByRecently--
                continue
            }
            memory.confidence = clamp(memory.confidence - MEMORY_CONFIDENCE_DECAY[this.getDifficultyKey()] * 2, 0, 1)
            if (memory.wasDamagedByRecently > 0) memory.wasDamagedByRecently--
            if (memory.confidence <= 0.01) this.enemyMemory.delete(enemyId)
        }

        return { visibleEnemies, rememberedEnemies }
    }

    updateEnemyMemory(enemy, visible, sensed = false) {
        if (!enemy) return
        const existing = this.enemyMemory.get(enemy.id) ?? {
            id: enemy.id,
            // If first contact is via "sound/sense", keep this deliberately imprecise.
            lastSeenX: enemy.x + (Math.random() - 0.5) * 2 * SOUND_MEMORY_NOISE[this.getDifficultyKey()],
            lastSeenY: enemy.y + (Math.random() - 0.5) * 2 * SOUND_MEMORY_NOISE[this.getDifficultyKey()] * 0.6,
            lastSeenVelocityX: enemy.velocityX ?? 0,
            lastSeenVelocityY: enemy.velocityY ?? 0,
            lastSeenTick: 0,
            confidence: 0,
            lastSeenWeapon: enemy.currentWeapon,
            wasDamagedByRecently: 0,
        }

        if (visible) {
            existing.lastSeenX = enemy.x
            existing.lastSeenY = enemy.y
            existing.lastSeenVelocityX = enemy.velocityX ?? 0
            existing.lastSeenVelocityY = enemy.velocityY ?? 0
            existing.lastSeenTick = LAST_KNOWN_DECAY
            existing.lastSeenWeapon = enemy.currentWeapon
            existing.confidence = clamp(existing.confidence + 0.32 + this.config.itemAwareness * 0.2, 0, 1)
        } else {
            existing.lastSeenTick = Math.max(0, existing.lastSeenTick - 1)
            existing.confidence = clamp(
                existing.confidence - MEMORY_CONFIDENCE_DECAY[this.getDifficultyKey()],
                0,
                1,
            )
            if (sensed) {
                // Keep a rough pursuit hint from nearby noise/motion without granting perfect tracking.
                const noise = SOUND_MEMORY_NOISE[this.getDifficultyKey()]
                existing.lastSeenX = enemy.x + (Math.random() - 0.5) * 2 * noise
                existing.lastSeenY = enemy.y + (Math.random() - 0.5) * 2 * noise * 0.6
                existing.lastSeenVelocityX = (enemy.velocityX ?? 0) * 0.5
                existing.lastSeenVelocityY = (enemy.velocityY ?? 0) * 0.5
                existing.confidence = Math.max(
                    existing.confidence,
                    SOUND_MEMORY_CONFIDENCE_FLOOR[this.getDifficultyKey()],
                )
                existing.lastSeenTick = Math.max(existing.lastSeenTick, Math.floor(LAST_KNOWN_DECAY * 0.4))
            }
        }

        if (visible) {
            existing.confidence = clamp(
                existing.confidence - MEMORY_CONFIDENCE_DECAY_VISIBLE[this.getDifficultyKey()],
                0,
                1,
            )
        }

        this.enemyMemory.set(enemy.id, existing)
    }

    inferEnemyPosition(memory) {
        if (!memory || memory.confidence <= MEMORY_MIN_CONFIDENCE) return null
        const inferFrames = MEMORY_INFER_FRAMES[this.getDifficultyKey()]
        const uncertainty = clamp(1 - memory.confidence, 0, 1)
        const vx = memory.lastSeenVelocityX * inferFrames * (0.6 + this.config.leadFactor * 0.5)
        const vy = memory.lastSeenVelocityY * inferFrames * (0.6 + this.config.leadFactor * 0.5)
        return {
            x: memory.lastSeenX + vx * (1 - uncertainty * 0.55),
            y: memory.lastSeenY + vy * (1 - uncertainty * 0.55),
        }
    }

    getCommittedTarget(enemies, perception) {
        if (this.targetCommitTimer <= 0 || this.committedTargetId == null) return null
        const candidate = enemies.find((enemy) => enemy.id === this.committedTargetId) ?? null
        if (!candidate) return null
        const confidence = this.getTargetConfidence(candidate, perception)
        if (confidence < MEMORY_MIN_CONFIDENCE) return null
        return candidate
    }

    commitTarget(targetId) {
        if (targetId == null) return
        const [minFrames, maxFrames] = TARGET_COMMIT_FRAMES[this.getDifficultyKey()]
        this.committedTargetId = targetId
        this.targetCommitTimer = randRange(minFrames, maxFrames)
    }

    pickRememberedTargetCandidate(rememberedEnemies, enemies) {
        let best = null
        let bestScore = -Infinity
        for (const memoryEntry of rememberedEnemies) {
            const enemy = enemies.find((entry) => entry.id === memoryEntry.enemyId)
            if (!enemy || memoryEntry.visible) continue
            const memory = this.enemyMemory.get(enemy.id)
            if (!memory) continue
            const distance = distanceToPoint(this.player, memoryEntry.inferredPosition ?? { x: memory.lastSeenX, y: memory.lastSeenY })
            const damageBias = memory.wasDamagedByRecently > 0 ? 0.22 : 0
            const score = memoryEntry.confidence * 1.2 + 1 / Math.max(distance, 32) + damageBias
            if (score > bestScore) {
                bestScore = score
                best = enemy
            }
        }
        return best
    }

    maybeUpdatePlan(target, distance, engagement, perception) {
        const targetId = target?.id ?? null
        const targetVisible = target ? this.canObserveEnemy(target) : false
        const targetHasFightLine = target ? this.hasLineOfSight(target) : false
        const confidence = this.getTargetConfidence(target, perception)
        const intention = this.chooseIntention(target, distance, engagement, confidence)
        this.currentIntention = intention
        if (
            this.planCommitTimer > 0 &&
            this.committedPlanTargetId != null &&
            this.committedPlanTargetId === targetId &&
            this.targetPosition &&
            (targetVisible || confidence > 0.22)
        ) {
            this.aimTarget = this.computeAimTarget(target)
            return
        }

        if (intention === 'disengage') {
            this.combatStyle = 'retreat'
        } else if (intention === 'holdAngle') {
            this.combatStyle = 'strafe'
        } else if (intention === 'reposition') {
            this.combatStyle = 'circle'
        } else {
            this.combatStyle = this.pickCombatStyle(target, distance, engagement)
        }

        if (!targetHasFightLine && confidence > 0.2 && this.combatStyle !== 'retreat') {
            // We know where the enemy is, but cannot shoot yet: commit to pursuit over local dancing.
            this.combatStyle = 'aggressive'
            this.pursuitCommitTimer = PURSUIT_STICKY_TICKS
        }
        if (intention === 'seekItem' && this.itemTarget) {
            this.targetPosition = itemWorldPosition(this.itemTarget)
        } else if (intention === 'holdAngle' && target) {
            this.targetPosition = this.chooseHoldPosition(target)
        } else {
            this.targetPosition = this.resolveTargetPosition(target, this.itemTarget)
        }
        this.combatPrimitive = this.pickCombatPrimitive(target, distance, confidence, intention)
        this.aimTarget = this.computeAimTarget(target)
        this.perceivedTargetConfidence = confidence
        this.committedPlanTargetId = targetId
        this.planCommitTimer = randRange(...PLAN_COMMIT_FRAMES[this.getDifficultyKey()])
    }

    chooseIntention(target, distance, engagement, confidence) {
        if (!target) return 'reposition'
        if (this.intentionCommitTimer > 0) return this.currentIntention

        const hasFightLine = this.hasLineOfSight(target)
        const hp = effectiveHp(this.player)
        const lowHp = hp < 65
        const railLike =
            this.player.currentWeapon === WeaponId.RAIL || this.player.currentWeapon === WeaponId.MACHINE
        const itemNeed = this.itemTarget ? this.scoreItem(this.itemTarget) * 42 : -Infinity

        const scores = {
            fight:
                confidence * 1.3 +
                (hasFightLine ? 0.5 : -0.1) +
                clamp(engagement * 0.35, -0.7, 0.8) +
                (distance < MEDIUM_RANGE ? 0.22 : -0.12),
            chase:
                confidence * 1.1 +
                (hasFightLine ? -0.3 : 0.8) +
                this.personality.chaseBias * 0.5 +
                clamp((distance - CLOSE_RANGE) / MEDIUM_RANGE, -0.3, 0.5),
            seekItem:
                itemNeed > 0 ? clamp(itemNeed, -1, 1.1) + (lowHp ? 0.7 : 0.12) : -Infinity,
            disengage:
                (lowHp ? 0.7 : 0) +
                this.mentalState.stress * 0.65 -
                this.personality.aggressionBias * 0.35 -
                clamp(engagement * 0.25, -0.3, 0.45),
            holdAngle:
                (railLike ? 0.35 : 0) +
                (hasFightLine ? 0.25 : -0.25) +
                (distance > MEDIUM_RANGE * 0.8 ? 0.2 : -0.15),
            reposition:
                0.3 +
                (hasFightLine ? 0.08 : 0.45) +
                (distance < CLOSE_RANGE * 0.8 ? 0.22 : 0) +
                this.mentalState.stress * 0.18,
        }

        if (this.currentIntention in scores) scores[this.currentIntention] += 0.12

        let bestIntention = 'fight'
        let bestScore = -Infinity
        for (const [intention, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score
                bestIntention = intention
            }
        }

        this.intentionCommitTimer = randRange(...INTENTION_COMMIT_FRAMES[this.getDifficultyKey()])
        return bestIntention
    }

    pickCombatPrimitive(target, distance, confidence, intention) {
        if (!target) return 'repositionHigh'
        if (intention === 'disengage') return 'backOff'
        if (intention === 'holdAngle') return this.player.currentWeapon === WeaponId.RAIL ? 'peek' : 'hold'
        if (intention === 'reposition') return 'repositionHigh'
        if (intention === 'seekItem') return 'breakLine'

        const targetAirborne =
            (typeof target.isOnGround === 'function' && !target.isOnGround()) ||
            Math.abs(target.velocityY ?? 0) > 1.4
        const preferred = this.getPreferredWeaponDistance()
        const tooClose = distance < preferred * 0.6
        const tooFar = distance > preferred * 1.35

        if (targetAirborne && (this.player.currentWeapon === WeaponId.RAIL || this.player.currentWeapon === WeaponId.SHAFT)) {
            return 'punishLanding'
        }

        switch (this.player.currentWeapon) {
            case WeaponId.SHOTGUN:
                if (tooFar) return 'closeGap'
                if (tooClose) return 'backOff'
                return confidence > 0.5 ? 'pressure' : 'peek'
            case WeaponId.ROCKET:
                if (distance < 80) return 'backOff'
                if (distance > 220) return 'closeGap'
                return targetAirborne ? 'punishLanding' : 'pressure'
            case WeaponId.RAIL:
                if (distance < 160) return 'breakLine'
                return confidence > 0.55 ? 'peek' : 'hold'
            case WeaponId.SHAFT:
            case WeaponId.PLASMA:
                if (tooFar) return 'closeGap'
                if (tooClose) return 'backOff'
                return 'pressure'
            case WeaponId.GAUNTLET:
                if (distance < 55 && effectiveHp(this.player) > effectiveHp(target) + 15) return 'closeGap'
                return 'backOff'
            default:
                if (tooFar) return 'closeGap'
                if (tooClose) return 'breakLine'
                return 'pressure'
        }
    }

    chooseHoldPosition(target) {
        const preferred = this.getPreferredWeaponDistance()
        const direction = sign(this.player.x - target.x) || this.strafeDirection
        return {
            x: target.x + direction * preferred,
            y: target.y,
        }
    }

    resolvePrimitiveMoveDirection(target, directionToTarget, routeDirection, distance) {
        if (!target) return null
        const preferred = this.getPreferredWeaponDistance()
        const primitive = this.combatPrimitive

        switch (primitive) {
            case 'hold':
                if (Math.abs(distance - preferred) <= PhysicsConstants.TILE_W * 0.7) return 0
                return distance > preferred ? routeDirection || directionToTarget : -directionToTarget
            case 'peek':
                if (!this.hasLineOfSight(target)) return routeDirection || directionToTarget
                return this.strafeDirection
            case 'pressure':
            case 'closeGap':
            case 'punishLanding':
                return routeDirection || directionToTarget || this.strafeDirection
            case 'backOff':
                return -directionToTarget || -this.strafeDirection
            case 'breakLine':
                return -directionToTarget || this.strafeDirection
            case 'repositionHigh':
                return routeDirection || this.strafeDirection || directionToTarget
            case 'setupAmbush':
                return this.hasLineOfSight(target) ? 0 : routeDirection || directionToTarget
            default:
                return null
        }
    }

    getPreferredWeaponDistance() {
        switch (this.player.currentWeapon) {
            case WeaponId.GAUNTLET:
                return 28
            case WeaponId.SHOTGUN:
                return 90
            case WeaponId.ROCKET:
                return 170
            case WeaponId.RAIL:
                return 300
            case WeaponId.PLASMA:
                return 145
            case WeaponId.SHAFT:
                return 170
            case WeaponId.GRENADE:
                return 180
            default:
                return 180
        }
    }

    getShotWindowScore(target, distance, confidence) {
        const preferred = this.getPreferredWeaponDistance()
        const rangeQuality = 1 - clamp(Math.abs(distance - preferred) / Math.max(preferred, 1), 0, 1)
        const targetAirborne =
            (typeof target.isOnGround === 'function' && !target.isOnGround()) ||
            Math.abs(target.velocityY ?? 0) > 1.2
        const primitivePressure =
            this.combatPrimitive === 'pressure' || this.combatPrimitive === 'punishLanding'
                ? 0.22
                : 0
        const primitiveHoldPenalty =
            this.combatPrimitive === 'backOff' || this.combatPrimitive === 'breakLine' ? 0.2 : 0
        return clamp(
            confidence * 0.45 +
                rangeQuality * 0.35 +
                (targetAirborne ? 0.18 : 0) +
                primitivePressure -
                primitiveHoldPenalty -
                this.mentalState.stress * 0.18,
            0,
            1,
        )
    }

    isAimAligned(target, threshold = 0.12) {
        if (!target) return false
        const desired = this.clampAimAngle(
            Math.atan2(target.y - this.player.y, target.x - this.player.x),
            target.x < this.player.x,
        )
        const diff = Math.abs(normalizeAngle(desired - this.player.aimAngle))
        return diff <= threshold
    }

    syncLegacyLastKnown(perception) {
        const bestVisible = perception?.visibleEnemies?.[0] ?? null
        if (bestVisible) {
            this.lastKnownEnemyPosition = { x: bestVisible.x, y: bestVisible.y }
            this.lastKnownEnemyTimer = LAST_KNOWN_DECAY
            return
        }

        let bestMemory = null
        for (const memory of this.enemyMemory.values()) {
            if ((bestMemory?.confidence ?? -1) < memory.confidence) bestMemory = memory
        }
        if (bestMemory && bestMemory.confidence > MEMORY_MIN_CONFIDENCE) {
            const inferred = this.inferEnemyPosition(bestMemory)
            if (inferred) {
                this.lastKnownEnemyPosition = inferred
                this.lastKnownEnemyTimer = Math.max(1, Math.floor(bestMemory.lastSeenTick))
                return
            }
        }

        if (this.lastKnownEnemyTimer > 0) this.lastKnownEnemyTimer--
    }

    getTargetConfidence(target, perception) {
        if (!target) return 0
        const memory = this.enemyMemory.get(target.id)
        const isVisible = this.canObserveEnemy(target)
        if (isVisible) return clamp((memory?.confidence ?? 0.8) * 0.6 + 0.4, 0, 1)
        if (perception?.rememberedEnemies) {
            const remembered = perception.rememberedEnemies.find((entry) => entry.enemyId === target.id)
            if (remembered) return remembered.confidence
        }
        return memory?.confidence ?? 0
    }

    maybeInjectReactionDelay(perception) {
        if (this.reactionDelayTimer > 0) return
        const danger = perception?.visibleEnemies?.length ?? 0
        if (danger <= 0) return
        const chance =
            REACTION_MISTAKE_CHANCE[this.getDifficultyKey()] * (1.1 - this.mentalState.confidence * 0.35) * (1 + this.mentalState.stress * 0.4)
        if (Math.random() > chance) return
        this.reactionDelayTimer = randRange(...REACTION_MISTAKE_DURATION[this.getDifficultyKey()])
    }

    shouldHesitateBeforeFire() {
        const chance =
            FIRE_HESITATION_CHANCE[this.getDifficultyKey()] *
            (1 + this.mentalState.stress * 0.8) *
            (1.15 - this.personality.aimDiscipline * 0.4) *
            (1.1 - this.mentalState.confidence * 0.25)
        return Math.random() < chance
    }

    getDifficultyKey() {
        if (this.config === DIFFICULTY.easy) return 'easy'
        if (this.config === DIFFICULTY.hard) return 'hard'
        return 'medium'
    }

    canSenseEnemy(enemy) {
        if (!enemy) return false
        const distance = distanceBetween(this.player, enemy)
        if (distance > SOUND_AWARENESS_RANGE[this.getDifficultyKey()]) return false
        const verticalGap = Math.abs(enemy.y - this.player.y)
        if (verticalGap > SOUND_AWARENESS_VERTICAL) return false
        const speed = Math.hypot(enemy.velocityX ?? 0, enemy.velocityY ?? 0)
        const motionBonus = speed > 1.2 ? 0.14 : 0
        const chance =
            0.24 +
            this.config.itemAwareness * 0.34 +
            this.personality.chaseBias * 0.18 +
            motionBonus
        return Math.random() < chance
    }

    canObserveEnemy(enemy) {
        // Full-map camera visibility means enemy position is globally observable.
        return !!enemy && !enemy.dead
    }

    hasLowCeilingForJump() {
        const col = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const feetRow = Math.floor(
            (this.player.y + PhysicsConstants.PLAYER_HALF_H) / PhysicsConstants.TILE_H,
        )
        return Map.isBrick(col, feetRow - 2) || Map.isBrick(col, feetRow - 3)
    }

    hasJumpHeadroomAt(col, feetRow) {
        return !Map.isBrick(col, feetRow - 2) && !Map.isBrick(col, feetRow - 3)
    }

    findJumpEscapeDirection(targetPosition) {
        const baseCol = Math.floor(this.player.x / PhysicsConstants.TILE_W)
        const feetRow = Math.floor(
            (this.player.y + PhysicsConstants.PLAYER_HALF_H) / PhysicsConstants.TILE_H,
        )
        const preferred = preferredDirections(sign((targetPosition?.x ?? this.player.x) - this.player.x))

        for (let offset = 1; offset <= 5; offset++) {
            for (const dir of preferred) {
                const col = baseCol + dir * offset
                if (Map.isBrick(col, feetRow - 1)) continue
                if (!Map.isBrick(col, feetRow)) continue
                if (!this.hasJumpHeadroomAt(col, feetRow)) continue
                return dir
            }
        }

        return 0
    }

    onRespawn() {
        this.target = null
        this.itemTarget = null
        this.targetPosition = null
        this.aimTarget = null
        this.routeTarget = null
        this.committedTargetId = null
        this.committedPlanTargetId = null
        this.committedMoveDirection = 0
        this.targetCommitTimer = 0
        this.planCommitTimer = 0
        this.movementCommitTimer = 0
        this.reactionDelayTimer = 0
        this.fireHesitationTimer = 0
        this.pursuitCommitTimer = 0
        this.routeCommitTimer = 0
        this.intentionCommitTimer = 0
        this.currentIntention = 'fight'
        this.combatPrimitive = 'pressure'
        this.enemyMemory.clear()
        this.lastKnownEnemyPosition = null
        this.lastKnownEnemyTimer = 0
        this.mentalState.stress = clamp(this.mentalState.stress * 0.5, 0, 1)
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

function preferredDirections(primary) {
    return primary >= 0 ? [1, -1] : [-1, 1]
}

function createPersonalityProfile(config) {
    const archetypes = ['aggressive', 'cautious', 'opportunist', 'collector', 'rocketeer', 'duelist']
    const archetype = archetypes[randInt(archetypes.length)] ?? 'opportunist'
    const baseSkill = clamp(config.strafeSkill * 0.7 + config.itemAwareness * 0.3, 0, 1)

    const profile = {
        archetype,
        aggressionBias: 0.5,
        greedBias: 0.5,
        aimDiscipline: clamp(0.45 + baseSkill * 0.45 + (Math.random() - 0.5) * 0.12, 0.2, 0.95),
        chaseBias: clamp(0.4 + config.leadFactor * 0.4 + (Math.random() - 0.5) * 0.2, 0.15, 0.95),
        panicThreshold: clamp(0.42 + (1 - baseSkill) * 0.35 + (Math.random() - 0.5) * 0.18, 0.2, 0.9),
    }

    switch (archetype) {
        case 'aggressive':
            profile.aggressionBias = 0.84
            profile.greedBias = 0.38
            profile.chaseBias = clamp(profile.chaseBias + 0.2, 0, 1)
            profile.panicThreshold = clamp(profile.panicThreshold - 0.12, 0, 1)
            break
        case 'cautious':
            profile.aggressionBias = 0.3
            profile.greedBias = 0.46
            profile.panicThreshold = clamp(profile.panicThreshold + 0.2, 0, 1)
            break
        case 'collector':
            profile.aggressionBias = 0.42
            profile.greedBias = 0.86
            break
        case 'rocketeer':
            profile.aggressionBias = 0.65
            profile.greedBias = 0.45
            profile.aimDiscipline = clamp(profile.aimDiscipline + 0.07, 0, 1)
            break
        case 'duelist':
            profile.aggressionBias = 0.58
            profile.greedBias = 0.34
            profile.aimDiscipline = clamp(profile.aimDiscipline + 0.1, 0, 1)
            break
        case 'opportunist':
        default:
            profile.aggressionBias = 0.54
            profile.greedBias = 0.52
            break
    }

    return profile
}
