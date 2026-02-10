import { ensureModelLoaded } from './assets'
import { Player } from './player'
import { SkinId } from './models'
import {
    decodeServerMessage,
    encodeHello,
    encodeInput,
    encodeJoinRoom,
    encodePing,
    initBinaryProtocol,
} from './binaryProtocolWasm'

const DEFAULT_SERVER_URL = 'ws://localhost:3001/ws'
const DEFAULT_MAP = 'dm2'
const INPUT_SEND_RATE_HZ = 60
const INPUT_SEND_INTERVAL_MS = 1000 / INPUT_SEND_RATE_HZ
const SERVER_TICK_MILLIS = 16
const SNAPSHOT_SEND_RATE_HZ = 30
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_SEND_RATE_HZ
const SNAPSHOT_BUFFER_MAX = 90
const SNAPSHOT_INTERVAL_MIN_MS = 12
const SNAPSHOT_INTERVAL_MAX_MS = 80
const PING_INTERVAL_MS = 1000
const DEFAULT_CLOCK_OFFSET_MS = 0
const DEFAULT_RTT_MS = 80
const DEFAULT_JITTER_MS = 5
const MIN_INTERP_DELAY_MS = 40
const MAX_INTERP_DELAY_MS = 180
const PENDING_INPUT_MAX = 240
const DEFAULT_TUNING = Object.freeze({
    interpBaseSnapshots: 2.25,
    interpRttFactor: 0.25,
    interpJitterFactor: 2.0,
    interpMinMs: MIN_INTERP_DELAY_MS,
    interpMaxMs: MAX_INTERP_DELAY_MS,
    reconcileSmoothMaxUnits: 18,
    reconcileDeadzoneUnits: 0.35,
    reconcileMinBlend: 0.14,
    reconcileMaxBlend: 0.48,
    maxExtrapolationMs: 90,
})

export class NetworkClient {
    constructor() {
        this.socket = null
        this.playerId = null
        this.roomId = null
        this.inputSeq = 0
        this.connected = false
        this.handlers = {}
        this.remotePlayers = new Map()
        this.localPlayer = null
        this.pendingInputs = []
        this.snapshotBuffer = []
        this.lastReconciledServerTick = -1
        this.lastCorrectionErrorUnits = 0
        this.lastCorrectionBlend = 1
        this.lastExtrapolationMs = 0
        this.lastRenderServerTimeMs = 0
        this.lastSnapshotTick = 0
        this.estimatedSnapshotIntervalMs = SNAPSHOT_INTERVAL_MS
        this.clockOffsetMs = DEFAULT_CLOCK_OFFSET_MS
        this.rttMs = DEFAULT_RTT_MS
        this.rttJitterMs = DEFAULT_JITTER_MS
        this.lastPingSentAt = -Infinity
        this.interpDelayMs = MIN_INTERP_DELAY_MS
        this.tuning = { ...DEFAULT_TUNING }
        this.inputSendIntervalMs = INPUT_SEND_INTERVAL_MS
        this.lastInputSentAt = -Infinity
        this.predictor = null
    }

    setHandlers(handlers) {
        this.handlers = handlers ?? {}
    }

    setLocalPlayer(player) {
        this.localPlayer = player
    }

    setPredictor(predictor) {
        this.predictor = predictor
    }

    isActive() {
        return this.connected
    }

    getRemotePlayers() {
        return [...this.remotePlayers.values()]
    }

    getNetStats() {
        return {
            rttMs: this.rttMs,
            jitterMs: this.rttJitterMs,
            clockOffsetMs: this.clockOffsetMs,
            interpDelayMs: this.interpDelayMs,
            snapshotBufferDepth: this.snapshotBuffer.length,
            latestSnapshotTick: this.lastSnapshotTick,
            renderServerTimeMs: this.lastRenderServerTimeMs,
            correctionErrorUnits: this.lastCorrectionErrorUnits,
            correctionBlend: this.lastCorrectionBlend,
            extrapolationMs: this.lastExtrapolationMs,
            pendingInputCount: this.pendingInputs.length,
        }
    }

    getTuning() {
        return { ...this.tuning }
    }

    setTuningValue(name, value) {
        if (!(name in this.tuning)) return false
        if (!Number.isFinite(value)) return false

        const next = Number(value)
        switch (name) {
            case 'interpBaseSnapshots':
                this.tuning[name] = clamp(next, 1.0, 5.0)
                return true
            case 'interpRttFactor':
                this.tuning[name] = clamp(next, 0, 1.0)
                return true
            case 'interpJitterFactor':
                this.tuning[name] = clamp(next, 0, 6.0)
                return true
            case 'interpMinMs':
                this.tuning[name] = clamp(next, 10, 250)
                this.tuning.interpMaxMs = Math.max(this.tuning.interpMaxMs, this.tuning.interpMinMs)
                return true
            case 'interpMaxMs':
                this.tuning[name] = clamp(next, 20, 500)
                this.tuning.interpMinMs = Math.min(this.tuning.interpMinMs, this.tuning.interpMaxMs)
                return true
            case 'reconcileSmoothMaxUnits':
                this.tuning[name] = clamp(next, 1, 80)
                return true
            case 'reconcileDeadzoneUnits':
                this.tuning[name] = clamp(next, 0, 6)
                return true
            case 'reconcileMinBlend':
                this.tuning[name] = clamp(next, 0.01, 1)
                this.tuning.reconcileMaxBlend = Math.max(
                    this.tuning.reconcileMaxBlend,
                    this.tuning.reconcileMinBlend,
                )
                return true
            case 'reconcileMaxBlend':
                this.tuning[name] = clamp(next, 0.01, 1)
                this.tuning.reconcileMinBlend = Math.min(
                    this.tuning.reconcileMinBlend,
                    this.tuning.reconcileMaxBlend,
                )
                return true
            case 'maxExtrapolationMs':
                this.tuning[name] = clamp(next, 0, 200)
                return true
            default:
                return false
        }
    }

    connect({ url = DEFAULT_SERVER_URL, username, roomId, map = DEFAULT_MAP } = {}) {
        if (this.connected) return Promise.resolve()
        if (!username) return Promise.reject(new Error('Username required'))

        return initBinaryProtocol().then(
            () =>
                new Promise((resolve, reject) => {
                    let settled = false
                    const resolveOnce = () => {
                        if (settled) return
                        settled = true
                        resolve()
                    }
                    const rejectOnce = (err) => {
                        if (settled) return
                        settled = true
                        reject(err)
                    }

                    this.socket = new WebSocket(url)
                    this.socket.binaryType = 'arraybuffer'

                    this.socket.addEventListener(
                        'open',
                        () => {
                            this.connected = true
                            this.lastInputSentAt = -Infinity
                            this.lastPingSentAt = -Infinity
                            this.send(encodeHello(username))
                            this.send(encodeJoinRoom(roomId ?? '', map))
                            this.handlers.onOpen?.()
                            resolveOnce()
                        },
                        { once: true },
                    )

                    this.socket.addEventListener('message', (event) => {
                        if (event.data instanceof ArrayBuffer) {
                            const msg = decodeServerMessage(event.data)
                            if (msg) this.handleMessage(msg)
                            return
                        }
                        console.warn('Unexpected text message', event.data)
                    })

                    this.socket.addEventListener('close', () => {
                        const wasConnected = this.connected
                        this.connected = false
                        this.playerId = null
                        this.roomId = null
                        this.lastInputSentAt = -Infinity
                        this.lastPingSentAt = -Infinity
                        this.snapshotBuffer.length = 0
                        this.pendingInputs.length = 0
                        this.lastReconciledServerTick = -1
                        this.lastCorrectionErrorUnits = 0
                        this.lastCorrectionBlend = 1
                        this.lastExtrapolationMs = 0
                        this.lastRenderServerTimeMs = 0
                        this.lastSnapshotTick = 0
                        this.estimatedSnapshotIntervalMs = SNAPSHOT_INTERVAL_MS
                        this.remotePlayers.clear()
                        this.handlers.onClose?.()
                        if (!wasConnected) {
                            rejectOnce(new Error('WebSocket closed before connection'))
                        }
                    })

                    this.socket.addEventListener(
                        'error',
                        (event) => {
                            this.handlers.onError?.(event)
                            rejectOnce(new Error('WebSocket error'))
                        },
                        { once: true },
                    )
                }),
        )
    }

    disconnect() {
        if (this.socket) {
            this.socket.close()
        }
    }

    sendInput(input, now = performance.now()) {
        if (!this.connected || !this.socket) return false
        if (now - this.lastInputSentAt < this.inputSendIntervalMs) return false

        this.lastInputSentAt = now
        this.inputSeq++
        this.pendingInputs.push({
            seq: this.inputSeq,
            input,
        })
        if (this.pendingInputs.length > PENDING_INPUT_MAX) {
            this.pendingInputs.splice(0, this.pendingInputs.length - PENDING_INPUT_MAX)
        }
        this.send(encodeInput(this.inputSeq, input))
        return true
    }

    send(payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
        this.socket.send(payload)
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                this.playerId = msg.player_id
                if (this.localPlayer) {
                    this.localPlayer.id = msg.player_id
                }
                this.handlers.onWelcome?.(msg)
                break
            case 'room_state':
                this.roomId = msg.room_id
                this.hydrateRoom(msg)
                this.handlers.onRoomState?.(msg)
                break
            case 'player_joined':
                if (msg.player?.id !== this.playerId) {
                    this.upsertRemotePlayer(msg.player)
                }
                this.handlers.onPlayerJoined?.(msg.player)
                break
            case 'player_left':
                this.removeRemotePlayer(msg.player_id)
                this.handlers.onPlayerLeft?.(msg.player_id)
                break
            case 'snapshot':
                this.applySnapshot(msg)
                this.handlers.onSnapshot?.(msg)
                break
            case 'pong':
                this.handlePong(msg)
                break
            default:
                break
        }
    }

    hydrateRoom(roomState) {
        for (const player of roomState.players ?? []) {
            if (player.id === this.playerId) continue
            this.upsertRemotePlayer(player)
        }
    }

    async upsertRemotePlayer(playerInfo) {
        if (!playerInfo?.id) return
        if (playerInfo.id === this.playerId) return
        if (this.remotePlayers.has(playerInfo.id)) {
            const player = this.remotePlayers.get(playerInfo.id)
            if (playerInfo.state) {
                applyPlayerState(player, playerInfo.state, true)
            }
            return
        }

        const player = new Player({ model: playerInfo.model, skin: playerInfo.skin })
        player.id = playerInfo.id
        this.remotePlayers.set(playerInfo.id, player)
        await ensureModelLoaded(player.model, player.skin ?? SkinId.RED)
        if (playerInfo.state) {
            applyPlayerState(player, playerInfo.state, true)
        }
    }

    removeRemotePlayer(playerId) {
        this.remotePlayers.delete(playerId)
    }

    applySnapshot(snapshot) {
        if (!snapshot?.players) return
        this.insertSnapshot(snapshot)

        for (const state of snapshot.players) {
            if (state.id === this.playerId && this.localPlayer) {
                this.reconcileLocal(state, Number(snapshot.tick ?? 0))
            } else {
                let player = this.remotePlayers.get(state.id)
                if (!player) {
                    player = new Player()
                    player.id = state.id
                    this.remotePlayers.set(state.id, player)
                    applyPlayerState(player, state, true)
                }
            }
        }
    }

    reconcileLocal(serverState, serverTick = 0) {
        if (serverTick <= this.lastReconciledServerTick) {
            return
        }
        this.lastReconciledServerTick = serverTick
        this.lastSnapshotTick = Math.max(this.lastSnapshotTick, serverTick)
        const lastSeq = serverState.last_input_seq ?? 0
        const predictedBefore = this.localPlayer ? captureMovementState(this.localPlayer) : null

        if (!this.localPlayer) return
        applyPlayerState(this.localPlayer, serverState, false)

        if (this.pendingInputs.length) {
            this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > lastSeq)
        }

        if (!this.predictor) return
        for (const entry of this.pendingInputs) {
            this.predictor(this.localPlayer, entry.input)
        }

        if (!predictedBefore) return
        const correctedAfter = captureMovementState(this.localPlayer)
        const correctionError = Math.hypot(
            correctedAfter.x - predictedBefore.x,
            correctedAfter.y - predictedBefore.y,
        )
        this.lastCorrectionErrorUnits = correctionError
        this.lastCorrectionBlend = 1

        if (correctionError <= this.tuning.reconcileDeadzoneUnits) {
            applyMovementState(this.localPlayer, predictedBefore)
            this.lastCorrectionBlend = 0
            return
        }

        if (correctionError >= this.tuning.reconcileSmoothMaxUnits) {
            return
        }

        const normalized = correctionError / this.tuning.reconcileSmoothMaxUnits
        const blend = clamp(
            this.tuning.reconcileMinBlend +
                (this.tuning.reconcileMaxBlend - this.tuning.reconcileMinBlend) * normalized,
            this.tuning.reconcileMinBlend,
            this.tuning.reconcileMaxBlend,
        )
        this.lastCorrectionBlend = blend

        applyMovementState(this.localPlayer, {
            x: lerp(predictedBefore.x, correctedAfter.x, blend),
            y: lerp(predictedBefore.y, correctedAfter.y, blend),
            prevX: lerp(predictedBefore.prevX, correctedAfter.prevX, blend),
            prevY: lerp(predictedBefore.prevY, correctedAfter.prevY, blend),
            velocityX: lerp(predictedBefore.velocityX, correctedAfter.velocityX, blend),
            velocityY: lerp(predictedBefore.velocityY, correctedAfter.velocityY, blend),
            aimAngle: lerpAngle(predictedBefore.aimAngle, correctedAfter.aimAngle, blend),
            prevAimAngle: lerpAngle(
                predictedBefore.prevAimAngle,
                correctedAfter.prevAimAngle,
                blend,
            ),
        })
    }

    updateInterpolation(now = performance.now()) {
        this.maybeSendPing(now)
        if (!this.snapshotBuffer.length) return

        const targetServerTime = this.estimateServerNowMs(now) - this.computeInterpDelayMs()
        this.lastRenderServerTimeMs = targetServerTime
        let older = null
        let newer = null

        for (let i = 0; i < this.snapshotBuffer.length; i++) {
            const snap = this.snapshotBuffer[i]
            if (snap.serverTimeMs > targetServerTime) {
                newer = snap
                older = this.snapshotBuffer[i - 1] ?? snap
                break
            }
        }

        if (!newer) {
            older = this.snapshotBuffer[this.snapshotBuffer.length - 1]
            newer = older
        }

        const lastSnapshot = this.snapshotBuffer[this.snapshotBuffer.length - 1]
        const extrapolationMs = Math.max(0, targetServerTime - lastSnapshot.serverTimeMs)
        this.lastExtrapolationMs = clamp(extrapolationMs, 0, this.tuning.maxExtrapolationMs)
        const blendTargetServerTime =
            extrapolationMs > 0
                ? lastSnapshot.serverTimeMs + this.lastExtrapolationMs
                : targetServerTime

        const span = Math.max(1, newer.serverTimeMs - older.serverTimeMs)
        const t = Math.min(1, Math.max(0, (blendTargetServerTime - older.serverTimeMs) / span))

        const olderMap = older.playerMap
        const newerMap = newer.playerMap

        for (const [id, player] of this.remotePlayers.entries()) {
            const a = olderMap.get(id)
            const b = newerMap.get(id) ?? a
            if (!a || !b) continue
            if (extrapolationMs > 0 && a === b) {
                applyExtrapolatedState(player, a, this.lastExtrapolationMs)
                continue
            }
            applyInterpolatedState(player, a, b, t)
        }
    }

    insertSnapshot(snapshot) {
        const tick = Number(snapshot.tick ?? 0)
        if (!Number.isFinite(tick) || tick < 0) return
        this.lastSnapshotTick = Math.max(this.lastSnapshotTick, tick)
        const serverTimeMs = tick * SERVER_TICK_MILLIS
        const prevLast = this.snapshotBuffer[this.snapshotBuffer.length - 1]
        if (prevLast) {
            const sample = serverTimeMs - prevLast.serverTimeMs
            if (sample > 0) {
                const clampedSample = clamp(
                    sample,
                    SNAPSHOT_INTERVAL_MIN_MS,
                    SNAPSHOT_INTERVAL_MAX_MS,
                )
                this.estimatedSnapshotIntervalMs +=
                    (clampedSample - this.estimatedSnapshotIntervalMs) * 0.15
            }
        }
        const entry = {
            tick,
            serverTimeMs,
            players: snapshot.players,
            playerMap: toPlayerMap(snapshot.players),
        }
        const existingIndex = this.snapshotBuffer.findIndex((snap) => snap.tick === tick)
        if (existingIndex >= 0) {
            this.snapshotBuffer[existingIndex] = entry
            return
        }
        this.snapshotBuffer.push(entry)
        this.snapshotBuffer.sort((a, b) => a.tick - b.tick)
        while (this.snapshotBuffer.length > SNAPSHOT_BUFFER_MAX) {
            this.snapshotBuffer.shift()
        }
    }

    maybeSendPing(now = performance.now()) {
        if (!this.connected || !this.socket) return
        if (now - this.lastPingSentAt < PING_INTERVAL_MS) return
        this.lastPingSentAt = now
        this.send(encodePing(Math.floor(now)))
    }

    handlePong(msg, now = performance.now()) {
        const clientSentAt = Number(msg.client_time_ms)
        const serverTimeMs = Number(msg.server_time_ms)
        if (!Number.isFinite(clientSentAt) || !Number.isFinite(serverTimeMs)) {
            return
        }

        const rttSample = Math.max(0, now - clientSentAt)
        const offsetSample = serverTimeMs - (clientSentAt + rttSample * 0.5)
        const alpha = 0.12
        const beta = 0.2

        this.rttMs += (rttSample - this.rttMs) * alpha
        this.clockOffsetMs += (offsetSample - this.clockOffsetMs) * alpha
        this.rttJitterMs += (Math.abs(rttSample - this.rttMs) - this.rttJitterMs) * beta
    }

    estimateServerNowMs(now = performance.now()) {
        return now + this.clockOffsetMs
    }

    computeInterpDelayMs() {
        const dynamicDelay =
            this.estimatedSnapshotIntervalMs * this.tuning.interpBaseSnapshots +
            this.rttMs * this.tuning.interpRttFactor +
            this.rttJitterMs * this.tuning.interpJitterFactor
        this.interpDelayMs = clamp(dynamicDelay, this.tuning.interpMinMs, this.tuning.interpMaxMs)
        return this.interpDelayMs
    }
}

function applyPlayerState(player, state, isRemote) {
    if (!player || !state) return
    player.prevX = player.x
    player.prevY = player.y
    player.x = state.x ?? player.x
    player.y = state.y ?? player.y
    player.velocityX = state.vx ?? player.velocityX
    player.velocityY = state.vy ?? player.velocityY
    player.aimAngle = state.aim_angle ?? player.aimAngle
    if (isRemote) {
        player.prevAimAngle = player.aimAngle
    }
    player.facingLeft = state.facing_left ?? player.facingLeft
    player.crouch = state.crouch ?? player.crouch
    player.keyLeft = state.key_left ?? player.keyLeft
    player.keyRight = state.key_right ?? player.keyRight
    player.keyUp = state.key_up ?? player.keyUp
    player.keyDown = state.key_down ?? player.keyDown
    player.dead = state.dead ?? player.dead
    player.health = state.health ?? player.health
    player.armor = state.armor ?? player.armor
    player.currentWeapon = state.current_weapon ?? player.currentWeapon
    player.fireCooldown = state.fire_cooldown ?? player.fireCooldown
    if (Array.isArray(state.weapons)) {
        player.weapons = state.weapons
    }
    if (Array.isArray(state.ammo)) {
        player.ammo = state.ammo
    }
}

function applyInterpolatedState(player, a, b, t) {
    player.prevX = player.x
    player.prevY = player.y
    player.prevAimAngle = player.aimAngle

    player.x = lerp(a.x, b.x, t)
    player.y = lerp(a.y, b.y, t)
    player.velocityX = lerp(a.vx ?? player.velocityX, b.vx ?? player.velocityX, t)
    player.velocityY = lerp(a.vy ?? player.velocityY, b.vy ?? player.velocityY, t)
    player.aimAngle = lerpAngle(a.aim_angle ?? 0, b.aim_angle ?? 0, t)
    player.facingLeft = b.facing_left ?? player.facingLeft
    player.crouch = b.crouch ?? player.crouch
    player.dead = b.dead ?? player.dead
    player.health = b.health ?? player.health
    player.armor = b.armor ?? player.armor
    player.currentWeapon = b.current_weapon ?? player.currentWeapon
    if (Array.isArray(b.weapons)) player.weapons = b.weapons
    if (Array.isArray(b.ammo)) player.ammo = b.ammo
}

function applyExtrapolatedState(player, state, extrapolationMs) {
    const dt = extrapolationMs / SERVER_TICK_MILLIS
    player.prevX = player.x
    player.prevY = player.y
    player.prevAimAngle = player.aimAngle
    player.x = state.x + (state.vx ?? 0) * dt
    player.y = state.y + (state.vy ?? 0) * dt
    player.velocityX = state.vx ?? player.velocityX
    player.velocityY = state.vy ?? player.velocityY
    player.aimAngle = state.aim_angle ?? player.aimAngle
    player.facingLeft = state.facing_left ?? player.facingLeft
    player.crouch = state.crouch ?? player.crouch
    player.dead = state.dead ?? player.dead
    player.health = state.health ?? player.health
    player.armor = state.armor ?? player.armor
    player.currentWeapon = state.current_weapon ?? player.currentWeapon
    if (Array.isArray(state.weapons)) player.weapons = state.weapons
    if (Array.isArray(state.ammo)) player.ammo = state.ammo
}

function toPlayerMap(players = []) {
    const map = new Map()
    for (const p of players) {
        map.set(p.id, p)
    }
    return map
}

function lerp(a, b, t) {
    return a + (b - a) * t
}

function lerpAngle(a, b, t) {
    let diff = b - a
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    return a + diff * t
}

function captureMovementState(player) {
    return {
        x: player.x,
        y: player.y,
        prevX: player.prevX,
        prevY: player.prevY,
        velocityX: player.velocityX,
        velocityY: player.velocityY,
        aimAngle: player.aimAngle,
        prevAimAngle: player.prevAimAngle,
    }
}

function applyMovementState(player, movementState) {
    player.x = movementState.x
    player.y = movementState.y
    player.prevX = movementState.prevX
    player.prevY = movementState.prevY
    player.velocityX = movementState.velocityX
    player.velocityY = movementState.velocityY
    player.aimAngle = movementState.aimAngle
    player.prevAimAngle = movementState.prevAimAngle
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}
