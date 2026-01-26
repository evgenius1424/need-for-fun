import { Bot } from './bot'
import { Map } from './map'
import { Constants } from './helpers'
import { Render } from './engine'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants
const MIN_SPAWN_DISTANCE = 100 // Minimum distance from other players

class BotManagerClass {
    bots = []
    allPlayers = [] // includes local player + all bots

    init(localPlayer) {
        this.allPlayers = [localPlayer]
    }

    spawnBot(difficulty = 'medium') {
        const bot = new Bot(difficulty)
        this.bots.push(bot)
        this.allPlayers.push(bot.player)

        // Spawn at a safe respawn point away from other players
        const spawn = this.findSafeSpawn()
        if (spawn) {
            bot.player.setXY(spawn.x, spawn.y)
        }
        bot.player.prevX = bot.player.x
        bot.player.prevY = bot.player.y
        bot.player.prevAimAngle = bot.player.aimAngle
        bot.player.spawnProtection = 120 // ~2 seconds of spawn protection

        console.log(`Bot spawned: ${bot.name} (${difficulty})`)
        return bot
    }

    findSafeSpawn() {
        const cols = Map.getCols()
        const rows = Map.getRows()
        const candidates = []

        const isActualBrick = (col, row) =>
            col >= 0 && col < cols && row >= 0 && row < rows && Map.isBrick(col, row)

        const isActualEmpty = (col, row) =>
            col >= 0 && col < cols && row >= 0 && row < rows && !Map.isBrick(col, row)

        const isValidSpawn = (col, row) =>
            isActualEmpty(col, row) && isActualEmpty(col, row + 1) && isActualBrick(col, row + 2)

        // Collect all valid spawn points with distance check
        for (let col = 1; col < cols - 1; col++) {
            for (let row = 0; row < rows - 2; row++) {
                if (!isValidSpawn(col, row)) continue

                const x = col * BRICK_WIDTH + BRICK_WIDTH / 2
                const y = (row + 1) * BRICK_HEIGHT

                let minDist = Infinity
                for (const player of this.allPlayers) {
                    if (player.dead) continue
                    const dist = Math.hypot(player.x - x, player.y - y)
                    minDist = Math.min(minDist, dist)
                }

                if (minDist >= MIN_SPAWN_DISTANCE) {
                    candidates.push({ x, y, dist: minDist })
                }
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.dist - a.dist)
            const topCandidates = candidates.slice(0, Math.min(5, candidates.length))
            return topCandidates[Math.floor(Math.random() * topCandidates.length)]
        }

        // Fallback: any valid spawn ignoring distance
        for (let col = 1; col < cols - 1; col++) {
            for (let row = 0; row < rows - 2; row++) {
                if (isValidSpawn(col, row)) {
                    return {
                        x: col * BRICK_WIDTH + BRICK_WIDTH / 2,
                        y: (row + 1) * BRICK_HEIGHT,
                    }
                }
            }
        }

        // Map respawn point fallback
        const spawn = Map.getRandomRespawn()
        if (spawn && spawn.row + 2 < rows && isValidSpawn(spawn.col, spawn.row)) {
            return {
                x: spawn.col * BRICK_WIDTH + BRICK_WIDTH / 2,
                y: (spawn.row + 1) * BRICK_HEIGHT,
            }
        }

        // Absolute fallback: find ANY ground, even at edges
        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows - 2; row++) {
                if (isValidSpawn(col, row)) {
                    return {
                        x: col * BRICK_WIDTH + BRICK_WIDTH / 2,
                        y: (row + 1) * BRICK_HEIGHT,
                    }
                }
            }
        }

        // Absolute fallback: spawn near the local player (guaranteed to have ground)
        const localPlayer = this.allPlayers[0]
        if (localPlayer) {
            console.warn('No valid spawn - using player position')
            return { x: localPlayer.x, y: localPlayer.y }
        }

        console.warn('No valid spawn point found!')
        return { x: BRICK_WIDTH * 2, y: BRICK_HEIGHT * 2 }
    }

    handleBotRespawn(bot) {
        const spawn = this.findSafeSpawn()
        bot.player.setXY(spawn.x, spawn.y)
        bot.player.prevX = bot.player.x
        bot.player.prevY = bot.player.y
        bot.player.prevAimAngle = bot.player.aimAngle
        bot.player.velocityX = 0
        bot.player.velocityY = 0
        bot.player.spawnProtection = 120
        bot.player.dead = false
        bot.player.health = 100
        bot.player.armor = 0
        bot.stuckTimer = 0
        bot.jumpCooldown = 0
    }

    removeBot(bot) {
        Render.cleanupBotSprite(bot.player.id)

        const botIndex = this.bots.indexOf(bot)
        if (botIndex !== -1) {
            this.bots.splice(botIndex, 1)
        }

        const playerIndex = this.allPlayers.indexOf(bot.player)
        if (playerIndex !== -1) {
            this.allPlayers.splice(playerIndex, 1)
        }
    }

    removeAllBots() {
        for (const bot of [...this.bots]) {
            this.removeBot(bot)
        }
    }

    update() {
        for (const bot of this.bots) {
            // Handle bot respawn using safe spawn
            if (bot.player.dead && bot.player.respawnTimer <= 0) {
                this.handleBotRespawn(bot)
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
        return this.allPlayers.filter(p => p !== excludePlayer)
    }
}

export const BotManager = new BotManagerClass()
