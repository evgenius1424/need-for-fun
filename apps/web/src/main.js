import { Howler } from 'howler'
import { Input, Settings, Sound, WeaponId, Console } from './helpers'
import { Map } from './map'
import { Player } from './player'
import { Physics, PhysicsConstants } from './engine/core/physics'
import { Render } from './engine/render'
import { Projectiles } from './projectiles'
import { loadAssets, ensureModelLoaded } from './assets'
import { BotManager } from './botManager'
import { SkinId } from './models'
import { NetworkClient } from './network'
import { getBackendWsUrl } from './config/network'

const AIM_INPUT_SCALE = 0.5
const PICKUP_RADIUS = PhysicsConstants.PICKUP_RADIUS
const MAX_AIM_DELTA = 12
const HITSCAN_PLAYER_RADIUS = PhysicsConstants.HITSCAN_PLAYER_RADIUS
const GAUNTLET_PLAYER_RADIUS = PhysicsConstants.GAUNTLET_PLAYER_RADIUS
const GAUNTLET_SPARK_OFFSET = PhysicsConstants.TILE_W * 0.55

const PROJECTILE_WEAPONS = new Set(['rocket', 'grenade', 'plasma', 'bfg'])
const PROJECTILE_KIND = Object.freeze({ rocket: 0, grenade: 1, plasma: 2, bfg: 3 })

await loadAssets()
await Map.loadFromQuery()
Physics.setMap(Map.getRows(), Map.getCols(), Map.getBricksFlat())

const ITEM_DEFS = {
    health5: { kind: 'health', amount: 5, max: PhysicsConstants.MAX_HEALTH, respawn: 300 },
    health25: { kind: 'health', amount: 25, max: PhysicsConstants.MAX_HEALTH, respawn: 300 },
    health50: { kind: 'health', amount: 50, max: PhysicsConstants.MAX_HEALTH, respawn: 600 },
    health100: { kind: 'health', amount: 100, max: PhysicsConstants.MEGA_HEALTH, respawn: 900 },
    armor50: { kind: 'armor', amount: 50, respawn: 600 },
    armor100: { kind: 'armor', amount: 100, respawn: 900 },
    quad: { kind: 'quad', respawn: 1200 },
    weapon_machine: { kind: 'weapon', weaponId: WeaponId.MACHINE, respawn: 600 },
    weapon_shotgun: { kind: 'weapon', weaponId: WeaponId.SHOTGUN, respawn: 600 },
    weapon_grenade: { kind: 'weapon', weaponId: WeaponId.GRENADE, respawn: 600 },
    weapon_rocket: { kind: 'weapon', weaponId: WeaponId.ROCKET, respawn: 600 },
}

const localPlayer = new Player()
const network = new NetworkClient()
let netDebugEnabled = false
let lastNetDebugUpdateAt = 0
let cachedNetDebugText = ''
let lastAppliedWorldSnapshotTick = -1
let remoteBotWrappers = []
let remoteBotWrapperSource = null

await ensureModelLoaded(localPlayer.model, SkinId.RED)

Render.initSprites(localPlayer)
Render.renderMap()
Render.setSceneReady(true)

const state = { lastMouseY: Input.mouseY, lastMoveDir: 0 }

BotManager.init(localPlayer)
spawnPlayer(localPlayer)
setupPointerLock()
setupExplosionHandlers()
setupConsoleCommands()
initNetwork()

requestAnimationFrame((ts) => gameLoop(ts, localPlayer))

function spawnPlayer(player) {
    const { col, row } = Map.getRandomRespawn()
    player.setXY(
        col * PhysicsConstants.TILE_W + PhysicsConstants.SPAWN_OFFSET_X,
        row * PhysicsConstants.TILE_H - PhysicsConstants.PLAYER_HALF_H,
    )
    player.prevX = player.x
    player.prevY = player.y
    player.aimAngle = 0
    player.prevAimAngle = 0
    player.facingLeft = false
    player.spawnProtection = PhysicsConstants.SPAWN_PROTECTION
}

function setupPointerLock() {
    const gameRoot = document.getElementById('game')
    gameRoot?.addEventListener('click', () => {
        Sound.unlock()
        Howler.ctx?.state === 'suspended' && Howler.ctx.resume()
        const canvas = gameRoot.querySelector('canvas')
        if (canvas && document.pointerLockElement !== canvas) {
            canvas.requestPointerLock()
        }
    })
}

function setupExplosionHandlers() {
    Projectiles.onExplosion((x, y, type, proj) => {
        const projectileKind = PROJECTILE_KIND[type]
        if (projectileKind == null) return

        const ownerId = proj?.ownerId ?? 0
        const attacker = BotManager.getAllPlayers().find((player) => player.id === ownerId)
        const pushScale = attacker?.quadDamage ? PhysicsConstants.QUAD_MULTIPLIER : 1
        const baseDamage = Physics.getExplosionBaseDamage(projectileKind)

        for (const player of BotManager.getAllPlayers()) {
            if (player.dead) continue

            const falloff = Physics.applyExplosionKnockback(
                player,
                x,
                y,
                projectileKind,
                ownerId,
                pushScale,
            )
            if (falloff < 0) continue

            const damage = baseDamage * falloff

            if (damage > 0) {
                player.takeDamage(damage, ownerId || player.id)
            }
        }
    })
}

function gameLoop(timestamp, player) {
    if (network.isActive()) {
        network.flushSnapshots()
        player.prevAimAngle = player.aimAngle

        const remotePlayers = network.getRemotePlayers()
        for (const remote of remotePlayers) {
            remote.prevAimAngle = remote.aimAngle
        }

        processMovementInput(player)
        processAimInput(player)

        const weaponSwitch = Input.weaponSwitch
        const weaponScroll = Input.weaponScroll

        const didSendInput = network.sendInput(
            {
                tick: timestamp | 0,
                key_up: player.keyUp,
                key_down: player.keyDown,
                key_left: player.keyLeft,
                key_right: player.keyRight,
                mouse_down: Input.mouseDown,
                weapon_switch: weaponSwitch,
                weapon_scroll: weaponScroll,
                aim_angle: player.aimAngle,
                facing_left: player.facingLeft,
            },
            timestamp,
        )

        if (didSendInput) {
            Input.weaponSwitch = -1
            Input.weaponScroll = 0
        }

        player.update()
        // Local prediction for movement only; server snapshots will correct.
        Physics.updateAllPlayers([player], timestamp)
        Projectiles.update()
        player.decayVisualCorrection(0.85)

        network.updateInterpolation()
        updateNetDebugOverlay(timestamp)
        const remoteBots = getRemoteBotWrappers(remotePlayers)
        Render.renderGame(player, remoteBots)
        requestAnimationFrame((ts) => gameLoop(ts, player))
        return
    }

    if (netDebugEnabled) {
        Render.setNetDebugOverlay('', false)
    }

    for (const p of BotManager.getAllPlayers()) {
        p.prevAimAngle = p.aimAngle
    }

    // Process local player input
    processMovementInput(player)
    processWeaponScroll(player)
    processWeaponSwitch(player)
    processAimInput(player)
    processFiring(player)

    // Update bots AI
    BotManager.update()

    // Process bot firing
    for (const bot of BotManager.getBots()) {
        const result = bot.applyFiring()
        if (result) {
            processBotFireResult(bot.player, result)
        }
    }

    // Update all players
    player.update()
    player.checkRespawn() // Handle local player respawn
    for (const bot of BotManager.getBots()) {
        bot.player.update()
    }

    // Update physics for all players (synchronized)
    Physics.updateAllPlayers(BotManager.getAllPlayers(), timestamp)

    Projectiles.update()

    // Process hits for all players
    for (const p of BotManager.getAllPlayers()) {
        processProjectileHits(p)
    }

    // Process item pickups for all players
    for (const p of BotManager.getAllPlayers()) {
        processItemPickups(p)
    }

    Render.renderGame(player, BotManager.getBots())
    requestAnimationFrame((ts) => gameLoop(ts, player))
}

function getRemoteBotWrappers(remotePlayers) {
    if (remotePlayers !== remoteBotWrapperSource) {
        remoteBotWrapperSource = remotePlayers
        if (remoteBotWrappers.length > remotePlayers.length) {
            remoteBotWrappers.length = remotePlayers.length
        }
        for (let i = 0; i < remotePlayers.length; i++) {
            const wrapper = remoteBotWrappers[i] ?? { player: remotePlayers[i] }
            wrapper.player = remotePlayers[i]
            remoteBotWrappers[i] = wrapper
        }
    }
    return remoteBotWrappers
}

function processBotFireResult(botPlayer, result) {
    processFireResult(botPlayer, result, BotManager.getOtherPlayers(botPlayer))
}

function processMovementInput(player) {
    player.keyUp = Input.keyUp
    player.keyDown = Input.keyDown
    player.keyLeft = Input.keyLeft
    player.keyRight = Input.keyRight
}

function processWeaponSwitch(player) {
    if (Input.weaponSwitch < 0) return
    player.switchWeapon(Input.weaponSwitch)
    Input.weaponSwitch = -1
}

function processWeaponScroll(player) {
    if (Input.weaponScroll === 0) return

    const direction = Input.weaponScroll < 0 ? -1 : 1
    Input.weaponScroll = 0

    const total = player.weapons.length
    for (let step = 1; step <= total; step++) {
        const next = (player.currentWeapon + direction * step + total) % total
        if (player.weapons[next]) {
            player.switchWeapon(next)
            break
        }
    }
}

function processAimInput(player) {
    const rawDelta = Input.pointerLocked ? extractPointerLockedDelta() : extractMouseDelta()

    if (rawDelta !== 0) {
        const cappedDelta = clamp(rawDelta, -MAX_AIM_DELTA, MAX_AIM_DELTA)
        const aimDelta =
            cappedDelta * Settings.aimSensitivity * AIM_INPUT_SCALE * (player.facingLeft ? -1 : 1)
        player.updateAimAngle(aimDelta, player.facingLeft)
    }

    updateFacingDirection(player)
}

function initNetwork() {
    network.setLocalPlayer(localPlayer)
    network.setHandlers({
        onOpen: () => {
            BotManager.removeAllBots()
        },
        onClose: () => {},
        onRoomState: async (room) => {
            if (room?.map) {
                const loaded = await Map.loadFromName(room.map)
                if (loaded) {
                    Physics.setMap(Map.getRows(), Map.getCols(), Map.getBricksFlat())
                    Render.renderMap()
                }
            }
        },
        onSnapshot: (snapshot) => {
            const tick = Number(snapshot?.tick ?? -1)
            if (Number.isFinite(tick)) {
                if (tick <= lastAppliedWorldSnapshotTick) return
                lastAppliedWorldSnapshotTick = tick
            }
            if (snapshot?.items) Map.setItemStates(snapshot.items)
            if (snapshot?.events) applySnapshotEvents(snapshot.events)
        },
        onPlayerLeft: (playerId) => {
            Render.cleanupBotSprite(playerId)
        },
    })
    network.setPredictor((player, input) => {
        applyPredictedInput(player, input)
        player.update()
        Physics.stepPlayers([player], 1)
    })
}

function setupConsoleCommands() {
    Console.registerCommand(
        'mp',
        async (args) => {
            const action = args[0]?.toLowerCase()

            if (!action) {
                Console.writeText(
                    `Multiplayer: ${network.isActive() ? 'connected' : 'disconnected'}`,
                )
                return
            }

            if (action === 'connect') {
                const username = args[1]?.trim()
                if (!username) {
                    Console.writeText('Usage: mp connect <username> [room] [auto|webrtc|ws]')
                    return
                }
                const roomId = args[2]?.trim() || 'room-1'
                const transport = args[3]?.trim()?.toLowerCase() || 'auto'
                const url = getBackendWsUrl()

                try {
                    Console.writeText(`Connecting to ${roomId} (${transport})...`)
                    await network.connect({ url, username, roomId, transport })
                    Console.writeText(
                        `Connected as ${username} via ${network.transport.toUpperCase()}`,
                    )
                } catch (err) {
                    Console.writeText(`Connection failed: ${err.message}`)
                }
                return
            }

            if (action === 'disconnect') {
                network.disconnect()
                Console.writeText('Disconnected')
                return
            }

            Console.writeText(
                'Usage: mp connect <username> [room] [auto|webrtc|ws] | mp disconnect',
            )
        },
        'connect/disconnect multiplayer',
    )

    Console.registerCommand(
        'net_debug',
        (args) => {
            const mode = args[0]?.toLowerCase()
            if (!mode) {
                Console.writeText(`net_debug: ${netDebugEnabled ? 'on' : 'off'}`)
                return
            }
            if (mode === 'on' || mode === '1') {
                netDebugEnabled = true
                Console.writeText('net_debug enabled')
                return
            }
            if (mode === 'off' || mode === '0') {
                netDebugEnabled = false
                Render.setNetDebugOverlay('', false)
                Console.writeText('net_debug disabled')
                return
            }
            Console.writeText('Usage: net_debug on|off')
        },
        'toggle network debug HUD',
    )

    Console.registerCommand(
        'net_profile',
        (args) => {
            const mode = args[0]?.toLowerCase()
            const options = network.getTuningProfiles().join('|')
            if (!mode) {
                Console.writeText(
                    `net_profile: ${network.getCurrentTuningProfile()} (available: ${options})`,
                )
                return
            }
            if (!network.applyTuningProfile(mode)) {
                Console.writeText(`Usage: net_profile <${options}>`)
                return
            }
            Console.writeText(`net_profile set to ${network.getCurrentTuningProfile()}`)
        },
        'apply net tuning profile',
    )

    Console.registerCommand(
        'net_tune',
        (args) => {
            const name = args[0]
            if (!name) {
                const tuning = network.getTuning()
                const summary = Object.entries(tuning)
                    .map(([k, v]) => `${k}=${round(v, 3)}`)
                    .join(' ')
                Console.writeText(`net_tune: ${summary}`)
                return
            }

            const nextValRaw = args[1]
            if (nextValRaw == null) {
                const tuning = network.getTuning()
                if (!(name in tuning)) {
                    Console.writeText(`Unknown key: ${name}`)
                    return
                }
                Console.writeText(`${name}=${round(tuning[name], 3)}`)
                return
            }

            const nextVal = Number.parseFloat(nextValRaw)
            if (!Number.isFinite(nextVal)) {
                Console.writeText('Usage: net_tune <key> <number>')
                return
            }
            if (!network.setTuningValue(name, nextVal)) {
                Console.writeText(`Unknown/invalid key: ${name}`)
                return
            }
            const tuning = network.getTuning()
            Console.writeText(`${name}=${round(tuning[name], 3)}`)
        },
        'view/set networking tune params',
    )

    Console.registerCommand(
        'bot',
        (args) => {
            const action = args[0]?.toLowerCase()
            if (!action) {
                Console.writeText('Usage: bot add [count] | bot remove | bot clear')
                return
            }
            if (action === 'add') {
                const count = Number.parseInt(args[1] ?? '1', 10)
                const total = Number.isFinite(count) ? Math.max(1, count) : 1
                for (let i = 0; i < total; i++) BotManager.spawnBot('medium')
                Console.writeText(`Added ${total} bot${total === 1 ? '' : 's'}`)
                return
            }
            if (action === 'remove') {
                const bots = BotManager.getBots()
                if (!bots.length) {
                    Console.writeText('No bots to remove')
                    return
                }
                BotManager.removeBot(bots[bots.length - 1])
                Console.writeText('Removed 1 bot')
                return
            }
            if (action === 'clear') {
                BotManager.removeAllBots()
                Console.writeText('Removed all bots')
                return
            }
            Console.writeText('Usage: bot add [count] | bot remove | bot clear')
        },
        'add/remove bots',
    )

    Console.registerCommand(
        'rail_width',
        (args) => {
            if (!args[0]) {
                Console.writeText(`Rail width: ${Settings.railWidth}`)
                return
            }
            const val = Number.parseInt(args[0], 10)
            if (!Number.isFinite(val)) {
                Console.writeText('Usage: rail_width <number>')
                return
            }
            Console.writeText(`Rail width set to ${Settings.setRailWidth(val)}`)
        },
        'get/set rail width',
    )

    Console.registerCommand(
        'rail_trail',
        (args) => {
            if (!args[0]) {
                Console.writeText(`Rail trail: ${Settings.railTrailTime}`)
                return
            }
            const val = Number.parseInt(args[0], 10)
            if (!Number.isFinite(val)) {
                Console.writeText('Usage: rail_trail <ticks>')
                return
            }
            Console.writeText(`Rail trail set to ${Settings.setRailTrailTime(val)}`)
        },
        'get/set rail trail time',
    )

    Console.registerCommand(
        'rail_alpha',
        (args) => {
            if (!args[0]) {
                Console.writeText(
                    `Rail progressive alpha: ${Settings.railProgressiveAlpha ? 'on' : 'off'}`,
                )
                return
            }
            const val = args[0] === '1' || args[0]?.toLowerCase() === 'on'
            Console.writeText(
                `Rail progressive alpha set to ${Settings.setRailProgressiveAlpha(val) ? 'on' : 'off'}`,
            )
        },
        'toggle rail progressive alpha',
    )

    Console.registerCommand(
        'rail_color',
        (args) => {
            if (args.length < 3) {
                const color = Settings.railColor.toString(16).padStart(6, '0')
                Console.writeText(`Rail color: #${color} (usage: rail_color <r> <g> <b>)`)
                return
            }
            const r = Number.parseInt(args[0], 10)
            const g = Number.parseInt(args[1], 10)
            const b = Number.parseInt(args[2], 10)
            if (![r, g, b].every(Number.isFinite)) {
                Console.writeText('Usage: rail_color <r> <g> <b>')
                return
            }
            const next = Settings.setRailColor(r, g, b)
            Console.writeText(`Rail color set to #${next.toString(16).padStart(6, '0')}`)
        },
        'get/set rail color',
    )

    Console.registerCommand(
        'rail_type',
        (args) => {
            if (!args[0]) {
                Console.writeText(`Rail type: ${Settings.railType}`)
                return
            }
            const val = Number.parseInt(args[0], 10)
            if (!Number.isFinite(val)) {
                Console.writeText('Usage: rail_type <0|1|2>')
                return
            }
            Console.writeText(`Rail type set to ${Settings.setRailType(val)}`)
        },
        'get/set rail type',
    )
}

function applySnapshotEvents(events) {
    for (const event of events) {
        if (!event?.type) continue
        switch (event.type) {
            case 'weapon_fired':
                playWeaponSound(event.weapon_id)
                break
            case 'projectile_spawn':
                Projectiles.spawnFromServer(event)
                break
            case 'rail':
                Render.addRailShot({
                    startX: event.start_x,
                    startY: event.start_y,
                    trace: { x: event.end_x, y: event.end_y },
                })
                break
            case 'shaft':
                Render.addShaftShot({
                    startX: event.start_x,
                    startY: event.start_y,
                    trace: { x: event.end_x, y: event.end_y },
                })
                break
            case 'bullet_impact':
                Render.addBulletImpact(event.x, event.y, { radius: event.radius ?? 2.5 })
                break
            case 'gauntlet':
                Render.addGauntletSpark(event.x, event.y)
                break
            case 'projectile_remove':
                // Explosion visuals/sounds come from the explicit `explosion` event.
                Projectiles.removeById(event.id, event.x, event.y, event.kind, {
                    emitEffects: false,
                })
                break
            case 'explosion':
                Render.addExplosion(event.x, event.y, event.kind)
                playExplosionSound(event.kind)
                break
            case 'damage':
                handleDamageEvent(event)
                break
            default:
                break
        }
    }
}

function handleDamageEvent(event) {
    const targetId = event?.target_id
    if (!targetId) return

    const target =
        targetId === localPlayer?.id
            ? localPlayer
            : network.getRemotePlayers().find((p) => p.id === targetId)

    if (!target) return

    if (event.killed) {
        Sound.death(target.model)
    } else {
        Sound.pain(target.model, event.amount)
    }
}

function playWeaponSound(weaponId) {
    switch (weaponId) {
        case WeaponId.MACHINE:
            Sound.machinegun()
            break
        case WeaponId.SHOTGUN:
            Sound.shotgun()
            break
        case WeaponId.GRENADE:
            Sound.grenade()
            break
        case WeaponId.ROCKET:
            Sound.rocket()
            break
        case WeaponId.RAIL:
            Sound.railgun()
            break
        case WeaponId.PLASMA:
            Sound.plasma()
            break
        case WeaponId.SHAFT:
            Sound.shaft()
            break
        case WeaponId.BFG:
            Sound.bfg()
            break
        default:
            break
    }
}

function playExplosionSound(kind) {
    switch (kind) {
        case 'rocket':
            Sound.rocketExplode()
            break
        case 'grenade':
            Sound.grenadeExplode()
            break
        case 'plasma':
        case 'bfg':
            Sound.plasmaHit()
            break
        default:
            break
    }
}

function applyPredictedInput(player, input) {
    if (!input) return
    player.keyUp = !!input.key_up
    player.keyDown = !!input.key_down
    player.keyLeft = !!input.key_left
    player.keyRight = !!input.key_right
    if (Number.isFinite(input.aim_angle)) {
        player.aimAngle = input.aim_angle
    }
    if (typeof input.facing_left === 'boolean') {
        player.facingLeft = input.facing_left
    }

    if (Number.isInteger(input.weapon_switch) && input.weapon_switch >= 0) {
        if (player.weapons[input.weapon_switch]) {
            player.switchWeapon(input.weapon_switch)
        }
    } else if (input.weapon_scroll) {
        const direction = input.weapon_scroll < 0 ? -1 : 1
        const total = player.weapons.length
        for (let step = 1; step <= total; step++) {
            const next = (player.currentWeapon + direction * step + total) % total
            if (player.weapons[next]) {
                player.switchWeapon(next)
                break
            }
        }
    }
}

function updateNetDebugOverlay(now) {
    if (!netDebugEnabled || !network.isActive()) {
        Render.setNetDebugOverlay('', false)
        return
    }
    if (now - lastNetDebugUpdateAt >= 100) {
        const stats = network.getNetStats()
        cachedNetDebugText =
            `RTT ${round(stats.rttMs, 1)}ms  J ${round(stats.jitterMs, 1)}  ` +
            `Off ${round(stats.clockOffsetMs, 1)}\n` +
            `Interp ${round(stats.interpDelayMs, 1)}ms  Buf ${stats.snapshotBufferDepth}  ` +
            `Tick ${stats.latestSnapshotTick}\n` +
            `Render ${round(stats.renderServerTimeMs / 16, 1)}t  ` +
            `Ext ${round(stats.extrapolationMs, 1)}ms  U+${round(stats.underrunBoostMs, 1)}  ` +
            `Corr ${round(stats.correctionErrorUnits, 2)}u b${round(stats.correctionBlend, 2)}  ` +
            `Inp ${stats.pendingInputCount}/${stats.unackedInputs} ` +
            `@${round(stats.inputSendHz, 0)}Hz  Stale ${stats.staleSnapshots}`
        lastNetDebugUpdateAt = now
    }
    Render.setNetDebugOverlay(cachedNetDebugText, true)
}

function extractPointerLockedDelta() {
    const delta = Input.mouseDeltaY
    Input.mouseDeltaY = 0
    return delta
}

function extractMouseDelta() {
    const delta = Input.mouseY - state.lastMouseY
    state.lastMouseY = Input.mouseY
    return delta
}

function updateFacingDirection(player) {
    const moveDir = Input.keyLeft ? -1 : Input.keyRight ? 1 : 0
    if (moveDir === 0) return

    const newFacingLeft = moveDir < 0

    if (newFacingLeft !== player.facingLeft) {
        player.aimAngle = normalizeAngle(Math.PI - player.aimAngle)
        player.prevAimAngle = player.aimAngle // Skip interpolation on flip
    }

    player.facingLeft = newFacingLeft
}

function processFiring(player) {
    if (!Input.mouseDown || player.dead) return

    const otherPlayers = BotManager.getOtherPlayers(player)
    const result = player.fire()
    processFireResult(player, result, otherPlayers)
}

function processFireResult(player, result, otherPlayers) {
    if (result?.type === 'rail') {
        applyHitscanShot(player, result, otherPlayers, 'rail')
    } else if (result?.type === 'shaft') {
        applyHitscanShot(player, result, otherPlayers, 'shaft')
    } else if (result?.type === 'hitscan') {
        applyHitscanShot(player, result, otherPlayers, 'bullet', 2.5)
    } else if (result?.type === 'shotgun') {
        for (const pellet of result.pellets) {
            const shot = { startX: result.startX, startY: result.startY, trace: pellet.trace }
            applyHitscanShot(
                player,
                { ...shot, damage: pellet.damage },
                otherPlayers,
                'bullet',
                2,
            )
        }
    } else if (result?.type === 'gauntlet') {
        const { x, y } = getWeaponTip(player, GAUNTLET_SPARK_OFFSET)
        Render.addGauntletSpark(x, y)
        applyMeleeDamage(player, result, otherPlayers)
    }
}

function processProjectileHits(player) {
    for (const proj of Projectiles.getAll()) {
        if (!proj.active || !Projectiles.checkPlayerCollision(player, proj)) continue

        const baseDamage = PROJECTILE_WEAPONS.has(proj.type)
            ? PhysicsConstants.getDamage(weaponIdFromType(proj.type))
            : 0
        if (baseDamage > 0) {
            const multiplier =
                proj.ownerId === localPlayer.id && localPlayer.quadDamage
                    ? PhysicsConstants.QUAD_MULTIPLIER
                    : 1
            player.takeDamage(baseDamage * multiplier, proj.ownerId)
        }

        Projectiles.explode(proj)
    }
}

function processItemPickups(player) {
    for (const item of Map.getItems()) {
        if (!item.active) {
            tickItemRespawn(item)
            continue
        }

        if (!isPlayerNearItem(player, item)) continue

        applyItemEffect(player, item)
        item.active = false
        item.respawnTimer = ITEM_DEFS[item.type]?.respawn ?? 300
    }
}

function tickItemRespawn(item) {
    if (--item.respawnTimer <= 0) {
        item.active = true
    }
}

function isPlayerNearItem(player, item) {
    const x = item.col * PhysicsConstants.TILE_W + PhysicsConstants.TILE_W / 2
    const y = item.row * PhysicsConstants.TILE_H + PhysicsConstants.TILE_H / 2
    return Math.hypot(player.x - x, player.y - y) <= PICKUP_RADIUS
}

function applyItemEffect(player, item) {
    const def = ITEM_DEFS[item.type]
    if (!def) return

    switch (def.kind) {
        case 'health':
            player.giveHealth(def.amount, def.max)
            break
        case 'armor':
            player.giveArmor(def.amount)
            break
        case 'quad':
            player.quadDamage = true
            player.quadTimer = PhysicsConstants.QUAD_DURATION
            break
        case 'weapon':
            player.giveWeapon(def.weaponId, PhysicsConstants.PICKUP_AMMO[def.weaponId] ?? 0)
            break
    }
}

function applyHitscanShot(attacker, shot, targets, effect, radius = 2.5) {
    const impact = resolveHitscanImpact(attacker, shot, targets)
    if (!impact) return

    switch (effect) {
        case 'rail':
            Render.addRailShot({
                startX: shot.startX,
                startY: shot.startY,
                trace: { x: impact.x, y: impact.y },
            })
            break
        case 'shaft':
            Render.addShaftShot({
                startX: shot.startX,
                startY: shot.startY,
                trace: { x: impact.x, y: impact.y },
            })
            break
        default:
            Render.addBulletImpact(impact.x, impact.y, { radius })
            break
    }

    applyHitscanDamage(attacker, shot.damage, impact)
}

function applyHitscanDamage(attacker, damage, impact) {
    if (!impact?.target) return
    const multiplier = attacker.quadDamage ? PhysicsConstants.QUAD_MULTIPLIER : 1
    impact.target.takeDamage(damage * multiplier, attacker.id)
}

function applyMeleeDamage(attacker, hit, targets) {
    if (targets.length === 0) return

    const target = findMeleeTarget(attacker, hit, targets)
    if (!target) return

    const multiplier = attacker.quadDamage ? PhysicsConstants.QUAD_MULTIPLIER : 1
    target.takeDamage(hit.damage * multiplier, attacker.id)
}

function findMeleeTarget(attacker, hit, targets) {
    let closest = null
    let closestDistSq = Infinity

    for (const target of targets) {
        if (!target || target.dead || target === attacker) continue

        const dx = target.x - hit.hitX
        const dy = target.y - hit.hitY
        const distSq = dx * dx + dy * dy

        if (distSq > GAUNTLET_PLAYER_RADIUS * GAUNTLET_PLAYER_RADIUS) continue

        if (distSq < closestDistSq) {
            closest = target
            closestDistSq = distSq
        }
    }

    return closest
}

function resolveHitscanImpact(attacker, shot, targets) {
    if (!shot?.trace) return null

    const startX = shot.startX
    const startY = shot.startY
    const endX = shot.trace.x
    const endY = shot.trace.y
    const dx = endX - startX
    const dy = endY - startY
    const lenSq = dx * dx + dy * dy || 1

    if (!Array.isArray(targets) || targets.length === 0) {
        return { x: endX, y: endY, target: null }
    }

    let closest = null
    let closestT = Infinity

    for (const target of targets) {
        if (!target || target.dead || target === attacker) continue

        const t = ((target.x - startX) * dx + (target.y - startY) * dy) / lenSq
        if (t < 0 || t > 1) continue

        const hitX = startX + dx * t
        const hitY = startY + dy * t
        const distX = target.x - hitX
        const distY = target.y - hitY
        const distSq = distX * distX + distY * distY

        if (distSq > HITSCAN_PLAYER_RADIUS * HITSCAN_PLAYER_RADIUS) continue

        if (t < closestT) {
            closest = target
            closestT = t
        }
    }

    if (!closest) return { x: endX, y: endY, target: null }
    return {
        x: startX + dx * closestT,
        y: startY + dy * closestT,
        target: closest,
    }
}

function getWeaponTip(player, offset) {
    const x = player.x + Math.cos(player.aimAngle) * offset
    const y = (player.crouch ? player.y + 4 : player.y) + Math.sin(player.aimAngle) * offset
    return { x, y }
}

function weaponIdFromType(type) {
    const map = {
        rocket: WeaponId.ROCKET,
        grenade: WeaponId.GRENADE,
        plasma: WeaponId.PLASMA,
        bfg: WeaponId.BFG,
    }
    return map[type]
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2
    while (angle < -Math.PI) angle += Math.PI * 2
    return angle
}

function round(value, digits = 2) {
    const m = 10 ** digits
    return Math.round(value * m) / m
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}
