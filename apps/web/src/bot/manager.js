import { Bot } from './bot'
import { Map } from '../game/map'
import { Render } from '../render'
import { PhysicsConstants } from '../game/physics'
import { ensureModelLoaded } from '../render/assets'

const MIN_SPAWN_DISTANCE = 100
const SPAWN_PROTECTION_FRAMES = PhysicsConstants.SPAWN_PROTECTION
const TOP_SPAWN_CANDIDATES = 5

class BotManagerClass {
    bots = []
    allPlayers = []

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
        for (const bot of this.bots) {
            if (bot.player.dead && bot.player.respawnTimer <= 0) {
                this.respawnBot(bot)
            }
            bot.update(this.allPlayers)
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
}

export const BotManager = new BotManagerClass()
