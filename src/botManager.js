import { Bot } from './bot'
import { Map } from './map'
import { Constants } from './helpers'

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
        bot.player.spawnProtection = 120 // ~2 seconds of spawn protection

        console.log(`Bot spawned: ${bot.name} (${difficulty})`)
        return bot
    }

    findSafeSpawn() {
        const cols = Map.getCols()
        const rows = Map.getRows()
        const candidates = []

        // Collect all valid spawn points
        for (let col = 1; col < cols - 1; col++) {
            for (let row = 1; row < rows - 2; row++) {
                const empty1 = !Map.isBrick(col, row)
                const empty2 = !Map.isBrick(col, row + 1)
                const ground = Map.isBrick(col, row + 2)

                if (empty1 && empty2 && ground) {
                    const x = col * BRICK_WIDTH + BRICK_WIDTH / 2
                    const y = (row + 1) * BRICK_HEIGHT

                    // Check distance from all players
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
        }

        // Pick random from safest spawns
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.dist - a.dist)
            const topCandidates = candidates.slice(0, Math.min(5, candidates.length))
            return topCandidates[Math.floor(Math.random() * topCandidates.length)]
        }

        // Fallback
        const spawn = Map.getRandomRespawn()
        return spawn
            ? { x: spawn.col * BRICK_WIDTH + 10, y: spawn.row * BRICK_HEIGHT - 24 }
            : { x: 100, y: 100 }
    }

    handleBotRespawn(bot) {
        const spawn = this.findSafeSpawn()
        bot.player.setXY(spawn.x, spawn.y)
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
