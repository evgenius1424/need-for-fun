import { Bot } from './bot'
import { Map } from '../game/map'
import { Render } from '../render'
import { PhysicsConstants } from '../game/physics'
import { ensureModelLoaded } from '../render/assets'

const MIN_SPAWN_DISTANCE = 100
const SPAWN_PROTECTION_FRAMES = PhysicsConstants.SPAWN_PROTECTION
const TOP_SPAWN_CANDIDATES = 5
const NAV_REBUILD_INTERVAL = 90
const NAV_SAMPLE_COL_STEP = 4
const NAV_SAMPLE_ROW_STEP = 3
const HOTSPOT_DECAY = 0.985
const HOTSPOT_MIN_INTENSITY = 0.08

class BotManagerClass {
    bots = []
    allPlayers = []
    matchTick = 0
    navigationContext = { anchors: [], builtAtTick: 0 }
    combatHotspots = []

    init(localPlayer) {
        this.allPlayers = [localPlayer]
    }

    spawnBot(difficulty = 'medium') {
        const bot = new Bot(difficulty)
        void ensureModelLoaded(bot.player.model, bot.player.skin)
        this.bots.push(bot)
        this.allPlayers.push(bot.player)

        const spawn = this.findSafeSpawn()
        this.initializePlayerAtSpawn(bot.player, spawn)
        bot.player.spawnProtection = SPAWN_PROTECTION_FRAMES

        return bot
    }

    removeBot(bot) {
        Render.cleanupBotSprite(bot.player.id)
        this.bots = this.bots.filter((b) => b !== bot)
        this.allPlayers = this.allPlayers.filter((p) => p !== bot.player)
    }

    removeAllBots() {
        ;[...this.bots].forEach((bot) => this.removeBot(bot))
    }

    update() {
        this.matchTick++
        this.decayCombatHotspots()
        if (
            this.navigationContext.anchors.length === 0 ||
            this.matchTick - this.navigationContext.builtAtTick >= NAV_REBUILD_INTERVAL
        ) {
            this.navigationContext = this.buildNavigationContext()
        }
        for (const bot of this.bots) {
            if (bot.player.dead && bot.player.respawnTimer <= 0) {
                this.respawnBot(bot)
            }
            bot.update(this.allPlayers, this.navigationContext)
        }
    }

    getBots() {
        return this.bots
    }

    getAllPlayers() {
        return this.allPlayers
    }

    getOtherPlayers(excludePlayer) {
        return this.allPlayers.filter((p) => p !== excludePlayer)
    }

    notifyDamage(victim, attacker = null) {
        if (!victim) return
        this.recordCombatHotspot(victim, attacker)
        const victimBot = this.bots.find((entry) => entry.player === victim)
        if (victimBot?.onDamaged) {
            victimBot.onDamaged(attacker && attacker !== victim ? attacker : null)
        }

        if (!victim.dead) return

        const attackerBot =
            attacker && attacker !== victim
                ? this.bots.find((entry) => entry.player === attacker)
                : null
        if (attackerBot?.onFrag) attackerBot.onFrag(victim)
        if (victimBot?.onKilledBy) victimBot.onKilledBy(attacker && attacker !== victim ? attacker : null)
    }

    respawnBot(bot) {
        const spawn = this.findSafeSpawn()
        this.initializePlayerAtSpawn(bot.player, spawn)
        Object.assign(bot.player, {
            velocityX: 0,
            velocityY: 0,
            spawnProtection: SPAWN_PROTECTION_FRAMES,
            dead: false,
            health: PhysicsConstants.MAX_HEALTH,
            armor: 0,
        })
        bot.stuckTimer = 0
        bot.jumpCooldown = 0
        if (bot.onRespawn) bot.onRespawn(this.matchTick)
    }

    initializePlayerAtSpawn(player, spawn) {
        player.setXY(spawn.x, spawn.y)
        player.prevX = player.x
        player.prevY = player.y
        player.prevAimAngle = player.aimAngle
    }

    findSafeSpawn() {
        return (
            this.findDistantSpawn() ??
            this.findAnyValidSpawn() ??
            this.findMapRespawnPoint() ??
            this.findFallbackSpawn()
        )
    }

    findDistantSpawn() {
        const candidates = this.collectSpawnCandidates()
            .filter((c) => c.dist >= MIN_SPAWN_DISTANCE)
            .sort((a, b) => b.dist - a.dist)
            .slice(0, TOP_SPAWN_CANDIDATES)

        if (candidates.length === 0) return null
        return candidates[Math.floor(Math.random() * candidates.length)]
    }

    collectSpawnCandidates() {
        const cols = Map.getCols()
        const rows = Map.getRows()
        const candidates = []

        for (let col = 1; col < cols - 1; col++) {
            for (let row = 0; row < rows - 2; row++) {
                if (!this.isValidSpawnCell(col, row)) continue

                const pos = this.cellToWorldPosition(col, row)
                const dist = this.minDistanceToLivePlayers(pos)
                candidates.push({ ...pos, dist })
            }
        }

        return candidates
    }

    findAnyValidSpawn() {
        const cols = Map.getCols()
        const rows = Map.getRows()

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows - 2; row++) {
                if (this.isValidSpawnCell(col, row)) {
                    return this.cellToWorldPosition(col, row)
                }
            }
        }
        return null
    }

    findMapRespawnPoint() {
        const spawn = Map.getRandomRespawn()
        if (!spawn) return null

        const rows = Map.getRows()
        if (spawn.row + 2 >= rows) return null
        if (!this.isValidSpawnCell(spawn.col, spawn.row)) return null

        return this.cellToWorldPosition(spawn.col, spawn.row)
    }

    findFallbackSpawn() {
        const localPlayer = this.allPlayers[0]
        if (localPlayer) {
            return { x: localPlayer.x, y: localPlayer.y }
        }
        return { x: PhysicsConstants.TILE_W * 2, y: PhysicsConstants.TILE_H * 2 }
    }

    isValidSpawnCell(col, row) {
        return (
            this.isEmptyCell(col, row) &&
            this.isEmptyCell(col, row + 1) &&
            this.isSolidCell(col, row + 2)
        )
    }

    isEmptyCell(col, row) {
        return this.isInBounds(col, row) && !Map.isBrick(col, row)
    }

    isSolidCell(col, row) {
        return this.isInBounds(col, row) && Map.isBrick(col, row)
    }

    isInBounds(col, row) {
        return col >= 0 && col < Map.getCols() && row >= 0 && row < Map.getRows()
    }

    cellToWorldPosition(col, row) {
        const groundRow = row + 2
        return {
            x: col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2,
            y: groundRow * PhysicsConstants.TILE_H - PhysicsConstants.PLAYER_HALF_H,
        }
    }

    minDistanceToLivePlayers(pos) {
        return this.allPlayers
            .filter((p) => !p.dead)
            .reduce((min, p) => Math.min(min, Math.hypot(p.x - pos.x, p.y - pos.y)), Infinity)
    }

    buildNavigationContext() {
        const anchors = this.collectNavigationAnchors()
        const hotspots = this.getActiveHotspots()
        const zones = this.buildZoneContext(anchors, hotspots)
        return {
            anchors,
            hotspots,
            zones,
            builtAtTick: this.matchTick,
        }
    }

    collectNavigationAnchors() {
        const anchors = []
        const cols = Map.getCols()
        const rows = Map.getRows()
        const items = Map.getItems() ?? []

        for (const item of items) {
            anchors.push({
                kind: 'item',
                x: item.col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2,
                y: item.row * PhysicsConstants.TILE_H + PhysicsConstants.TILE_H / 2,
                value: this.getAnchorItemValue(item.type),
            })
        }

        for (let col = 1; col < cols - 1; col += NAV_SAMPLE_COL_STEP) {
            for (let row = 1; row < rows - 3; row += NAV_SAMPLE_ROW_STEP) {
                if (!this.isStandableCell(col, row)) continue
                const x = col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2
                const y = (row + 1) * PhysicsConstants.TILE_H - PhysicsConstants.PLAYER_HALF_H
                anchors.push({
                    kind: 'platform',
                    x,
                    y,
                    value: 0.6,
                })
            }
        }

        return anchors
    }

    getActiveHotspots() {
        return this.combatHotspots
            .filter((entry) => entry.intensity > HOTSPOT_MIN_INTENSITY)
            .map((entry) => ({
                x: entry.x,
                y: entry.y,
                intensity: entry.intensity,
                ttl: entry.ttl,
            }))
    }

    buildZoneContext(anchors, hotspots) {
        const cols = Map.getCols()
        const rows = Map.getRows()
        const zoneCols = 3
        const zoneRows = 2
        const zones = []

        for (let zx = 0; zx < zoneCols; zx++) {
            for (let zy = 0; zy < zoneRows; zy++) {
                const minCol = Math.floor((zx / zoneCols) * cols)
                const maxCol = Math.floor(((zx + 1) / zoneCols) * cols)
                const minRow = Math.floor((zy / zoneRows) * rows)
                const maxRow = Math.floor(((zy + 1) / zoneRows) * rows)
                const centerX = ((minCol + maxCol) * 0.5 + 0.5) * PhysicsConstants.TILE_W
                const centerY = ((minRow + maxRow) * 0.5 + 0.5) * PhysicsConstants.TILE_H
                const anchorValue = anchors
                    .filter((a) => {
                        const col = Math.floor(a.x / PhysicsConstants.TILE_W)
                        const row = Math.floor(a.y / PhysicsConstants.TILE_H)
                        return col >= minCol && col < maxCol && row >= minRow && row < maxRow
                    })
                    .reduce((sum, a) => sum + (a.value ?? 0), 0)
                const danger = hotspots
                    .map(
                        (h) =>
                            h.intensity /
                            Math.max(1, Math.hypot(h.x - centerX, h.y - centerY) / PhysicsConstants.TILE_W),
                    )
                    .reduce((sum, v) => sum + v, 0)
                zones.push({
                    id: `${zx}:${zy}`,
                    centerX,
                    centerY,
                    resourceValue: anchorValue,
                    danger,
                })
            }
        }

        return zones
    }

    recordCombatHotspot(victim, attacker) {
        const points = [{ x: victim.x, y: victim.y, amount: 0.45 }]
        if (attacker && !attacker.dead) {
            points.push({
                x: (victim.x + attacker.x) * 0.5,
                y: (victim.y + attacker.y) * 0.5,
                amount: 0.3,
            })
        }

        for (const p of points) {
            const existing = this.combatHotspots.find(
                (entry) => Math.hypot(entry.x - p.x, entry.y - p.y) < PhysicsConstants.TILE_W * 2,
            )
            if (existing) {
                existing.x = (existing.x * 0.7 + p.x * 0.3)
                existing.y = (existing.y * 0.7 + p.y * 0.3)
                existing.intensity = Math.min(2, existing.intensity + p.amount)
                existing.ttl = Math.max(existing.ttl, 240)
            } else {
                this.combatHotspots.push({
                    x: p.x,
                    y: p.y,
                    intensity: p.amount,
                    ttl: 240,
                })
            }
        }
    }

    decayCombatHotspots() {
        for (const hotspot of this.combatHotspots) {
            hotspot.intensity *= HOTSPOT_DECAY
            hotspot.ttl--
        }
        this.combatHotspots = this.combatHotspots.filter(
            (entry) => entry.ttl > 0 && entry.intensity > HOTSPOT_MIN_INTENSITY,
        )
    }

    isStandableCell(col, row) {
        return (
            this.isInBounds(col, row) &&
            this.isInBounds(col, row + 1) &&
            this.isInBounds(col, row + 2) &&
            !Map.isBrick(col, row) &&
            !Map.isBrick(col, row + 1) &&
            Map.isBrick(col, row + 2)
        )
    }

    getAnchorItemValue(type) {
        switch (type) {
            case 'quad':
            case 'health100':
            case 'armor100':
                return 1.6
            case 'health50':
            case 'armor50':
            case 'weapon_rocket':
                return 1.2
            default:
                return 0.85
        }
    }
}

export const BotManager = new BotManagerClass()
