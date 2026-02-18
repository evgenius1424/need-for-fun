import { ensureModelLoaded } from '../render/assets'
import { Player } from '../game/player'
import { SkinId } from '../core/models'
import {
    decodeServerMessage,
    encodeHello,
    encodeInput,
    encodeJoinRoom,
    encodePing,
    initProtocolWasm,
} from './protocol'
import { getBackendWsUrl } from './wsEndpoint'

const DEFAULT_SERVER_URL = getBackendWsUrl()
const DEFAULT_MAP = 'dm2'
const DEFAULT_TRANSPORT_MODE = 'auto'
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
const REMOTE_AIM_MICRO_SMOOTH = 0.35
const REMOTE_FACING_CONFIRM_FRAMES = 3
const INPUT_MIN_SEND_HZ = 30
const INPUT_MAX_SEND_HZ = 90
const TELEPORT_THRESHOLD_UNITS = 40
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
    interpUnderrunBoostMaxMs: 70,
    interpUnderrunGain: 0.35,
    interpUnderrunDecay: 0.9,
    inputBaseHz: 60,
    inputIdleHz: 30,
    inputAckBacklogThreshold: 4,
    inputResendStallMs: 110,
})
const TUNING_PROFILES = Object.freeze({
    stable: {
        interpBaseSnapshots: 2.9,
        interpRttFactor: 0.33,
        interpJitterFactor: 3.2,
        interpMinMs: 55,
        interpMaxMs: 230,
        maxExtrapolationMs: 70,
        interpUnderrunBoostMaxMs: 110,
        interpUnderrunGain: 0.45,
        interpUnderrunDecay: 0.94,
        inputBaseHz: 54,
        inputIdleHz: 26,
        inputAckBacklogThreshold: 3,
        inputResendStallMs: 95,
    },
    balanced: {
        ...DEFAULT_TUNING,
    },
    aggressive: {
        interpBaseSnapshots: 1.7,
        interpRttFactor: 0.17,
        interpJitterFactor: 1.35,
        interpMinMs: 28,
        interpMaxMs: 130,
        maxExtrapolationMs: 120,
        interpUnderrunBoostMaxMs: 45,
        interpUnderrunGain: 0.28,
        interpUnderrunDecay: 0.86,
        inputBaseHz: 75,
        inputIdleHz: 38,
        inputAckBacklogThreshold: 5,
        inputResendStallMs: 130,
    },
})
const DEFAULT_TUNING_PROFILE = 'balanced'

export class NetworkClient {
    constructor() {
        this.socket = null
        this.signalSocket = null
        this.peerConnection = null
        this.controlDataChannel = null
        this.gameDataChannel = null
        this.transport = 'none'
        this.playerId = null
        this.roomId = null
        this.inputSeq = 0
        this.connected = false
        this.handlers = {}
        this.remotePlayers = new Map()
        this._remotePlayerCache = []
        this._remotePlayersDirty = true
        this.localPlayer = null
        this.pendingInputs = []
        this.pendingSnapshots = []
        this.snapshotBuffer = []
        this.lastReconciledServerTick = -1
        this.lastCorrectionErrorUnits = 0
        this.lastCorrectionBlend = 1
        this.lastExtrapolationMs = 0
        this.lastRenderServerTimeMs = 0
        this.lastSnapshotTick = 0
        this.estimatedSnapshotIntervalMs = SNAPSHOT_INTERVAL_MS
        this.interpUnderrunBoostMs = 0
        this.staleSnapshotCount = 0
        this.clockOffsetMs = DEFAULT_CLOCK_OFFSET_MS
        this.clockOffsetInitialized = false
        this.rttMs = DEFAULT_RTT_MS
        this.rttJitterMs = DEFAULT_JITTER_MS
        this.lastPingSentAt = -Infinity
        this.lastAckedInputSeq = 0
        this.lastAckProgressAtMs = 0
        this.lastSentInputSignature = ''
        this.currentInputSendHz = INPUT_SEND_RATE_HZ
        this.interpDelayMs = MIN_INTERP_DELAY_MS
        this.tuning = { ...DEFAULT_TUNING }
        this.tuningProfile = DEFAULT_TUNING_PROFILE
        this.applyTuningProfile(DEFAULT_TUNING_PROFILE)
        this.inputSendIntervalMs = INPUT_SEND_INTERVAL_MS
        this.lastInputSentAt = -Infinity
        this.predictor = null
        this.connectOptions = null
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
        if (this._remotePlayersDirty) {
            this._remotePlayerCache = [...this.remotePlayers.values()]
            this._remotePlayersDirty = false
        }
        return this._remotePlayerCache
    }

    getNetStats() {
        return {
            transport: this.transport,
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
            underrunBoostMs: this.interpUnderrunBoostMs,
            staleSnapshots: this.staleSnapshotCount,
            inputSendHz: this.currentInputSendHz,
            unackedInputs: Math.max(0, this.inputSeq - this.lastAckedInputSeq),
            pendingInputCount: this.pendingInputs.length,
        }
    }

    getTuning() {
        return { ...this.tuning }
    }

    getTuningProfiles() {
        return Object.keys(TUNING_PROFILES)
    }

    getCurrentTuningProfile() {
        return this.tuningProfile
    }

    setTuningValue(name, value) {
        if (!(name in this.tuning)) return false
        if (!Number.isFinite(value)) return false

        const next = Number(value)
        this.tuningProfile = 'custom'
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
            case 'interpUnderrunBoostMaxMs':
                this.tuning[name] = clamp(next, 0, 250)
                return true
            case 'interpUnderrunGain':
                this.tuning[name] = clamp(next, 0, 2)
                return true
            case 'interpUnderrunDecay':
                this.tuning[name] = clamp(next, 0.5, 0.999)
                return true
            case 'inputBaseHz':
                this.tuning[name] = clamp(next, INPUT_MIN_SEND_HZ, INPUT_MAX_SEND_HZ)
                return true
            case 'inputIdleHz':
                this.tuning[name] = clamp(next, 10, this.tuning.inputBaseHz)
                return true
            case 'inputAckBacklogThreshold':
                this.tuning[name] = clamp(Math.round(next), 1, 24)
                return true
            case 'inputResendStallMs':
                this.tuning[name] = clamp(next, 20, 600)
                return true
            default:
                return false
        }
    }

    applyTuningProfile(name) {
        const key = String(name ?? '').toLowerCase()
        const profile = TUNING_PROFILES[key]
        if (!profile) return false

        this.tuning = { ...DEFAULT_TUNING }
        for (const [k, v] of Object.entries(profile)) {
            this.setTuningValue(k, v)
        }
        this.tuningProfile = key
        return true
    }

    connect({
        url = DEFAULT_SERVER_URL,
        username,
        roomId,
        map = DEFAULT_MAP,
        transport = DEFAULT_TRANSPORT_MODE,
    } = {}) {
        if (this.connected) return Promise.resolve()
        if (!username) return Promise.reject(new Error('Username required'))

        const resolvedTransport = normalizeTransportMode(transport)
        if (!resolvedTransport) {
            return Promise.reject(new Error("transport must be 'auto', 'webrtc', or 'ws'"))
        }

        this.connectOptions = {
            url,
            username,
            roomId,
            map,
            transport: resolvedTransport,
        }

        return initProtocolWasm().then(async () => {
            this.resetConnectionState()
            if (resolvedTransport === 'ws') {
                await this.connectWebSocket({ url, username, roomId, map })
                return
            }

            if (resolvedTransport === 'webrtc') {
                await this.connectWebRtc({ url, username, roomId, map })
                return
            }

            try {
                await this.connectWebRtc({ url, username, roomId, map })
            } catch (err) {
                console.warn('WebRTC connect failed, falling back to WebSocket', err)
                this.handleTransportClosed()
                await this.connectWebSocket({ url, username, roomId, map })
            }
        })
    }

    disconnect() {
        this.handleTransportClosed()
    }

    sendInput(input, now = performance.now()) {
        if (!this.connected) return false
        if (this.transport === 'ws' && !this.socket) return false
        if (this.transport === 'webrtc' && !this.gameDataChannel) return false
        const signature = buildInputSignature(input)
        const inputChanged = signature !== this.lastSentInputSignature

        this.updateInputSendInterval(input, now)
        const ackStalled = this.isAckProgressStalled(now)
        if (!inputChanged && !ackStalled && now - this.lastInputSentAt < this.inputSendIntervalMs) {
            return false
        }

        this.lastInputSentAt = now
        this.inputSeq++
        this.pendingInputs.push({
            seq: this.inputSeq,
            input,
        })
        this.lastSentInputSignature = signature
        if (this.pendingInputs.length > PENDING_INPUT_MAX) {
            this.pendingInputs.splice(0, this.pendingInputs.length - PENDING_INPUT_MAX)
        }
        this.sendGame(encodeInput(this.inputSeq, input))
        return true
    }

    send(payload) {
        if (this.transport === 'ws') {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
            this.socket.send(payload)
        }
    }

    sendControl(payload) {
        if (this.transport === 'webrtc') {
            if (!this.controlDataChannel || this.controlDataChannel.readyState !== 'open') return
            this.controlDataChannel.send(payload)
            return
        }
        this.send(payload)
    }

    sendGame(payload) {
        if (this.transport === 'webrtc') {
            if (!this.gameDataChannel || this.gameDataChannel.readyState !== 'open') return
            this.gameDataChannel.send(payload)
            return
        }
        this.send(payload)
    }

    async connectWebSocket({ url, username, roomId, map }) {
        await new Promise((resolve, reject) => {
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
            this.transport = 'ws'

            this.socket.addEventListener(
                'open',
                () => {
                    this.connected = true
                    this.lastInputSentAt = -Infinity
                    this.lastPingSentAt = -Infinity
                    this.lastAckProgressAtMs = performance.now()
                    this.lastAckedInputSeq = 0
                    this.lastSentInputSignature = ''
                    this.currentInputSendHz = INPUT_SEND_RATE_HZ
                    this.sendControl(encodeHello(username))
                    this.sendControl(encodeJoinRoom(roomId ?? '', map))
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
                this.handleTransportClosed()
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
        })
    }

    async connectWebRtc({ url, username, roomId, map }) {
        try {
            if (typeof RTCPeerConnection === 'undefined') {
                throw new Error('WebRTC not supported by this browser')
            }

            const signalingUrl = toRtcSignalingUrl(url)
            this.signalSocket = new WebSocket(signalingUrl)
            this.signalSocket.binaryType = 'arraybuffer'

            await waitForWebSocketOpen(this.signalSocket)

            this.peerConnection = new RTCPeerConnection({ iceServers: buildIceServers() })
            this.transport = 'webrtc'

            this.peerConnection.addEventListener('connectionstatechange', () => {
                const state = this.peerConnection?.connectionState
                if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                    this.handleTransportClosed()
                }
            })

            this.controlDataChannel = this.peerConnection.createDataChannel('control')
            this.gameDataChannel = this.peerConnection.createDataChannel('game', {
                ordered: false,
                maxRetransmits: 0,
            })
            this.controlDataChannel.binaryType = 'arraybuffer'
            this.gameDataChannel.binaryType = 'arraybuffer'

            const onChannelMessage = (event) => {
                const data =
                    event.data instanceof ArrayBuffer
                        ? event.data
                        : new Uint8Array(event.data).buffer
                const msg = decodeServerMessage(data)
                if (msg) this.handleMessage(msg)
            }

            this.controlDataChannel.addEventListener('message', onChannelMessage)
            this.gameDataChannel.addEventListener('message', onChannelMessage)
            this.controlDataChannel.addEventListener('close', () => {
                this.handleTransportClosed()
            })
            this.gameDataChannel.addEventListener('close', () => {
                this.handleTransportClosed()
            })

            const channelsOpenPromise = Promise.all([
                waitForDataChannelOpen(this.controlDataChannel),
                waitForDataChannelOpen(this.gameDataChannel),
            ])

            const offer = await this.peerConnection.createOffer()
            await this.peerConnection.setLocalDescription(offer)
            await waitForIceGatheringComplete(this.peerConnection)

            this.signalSocket.send(
                JSON.stringify({
                    type: 'offer',
                    sdp: this.peerConnection.localDescription?.sdp ?? offer.sdp,
                }),
            )

            const answerSdp = await waitForRtcAnswer(this.signalSocket, 10000)
            await this.peerConnection.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp,
            })

            this.signalSocket.close()
            this.signalSocket = null

            await channelsOpenPromise
            this.connected = true
            this.lastInputSentAt = -Infinity
            this.lastPingSentAt = -Infinity
            this.lastAckProgressAtMs = performance.now()
            this.lastAckedInputSeq = 0
            this.lastSentInputSignature = ''
            this.currentInputSendHz = INPUT_SEND_RATE_HZ
            this.sendControl(encodeHello(username))
            this.sendControl(encodeJoinRoom(roomId ?? '', map))
            this.handlers.onOpen?.()
        } catch (err) {
            if (this.signalSocket) {
                try {
                    this.signalSocket.close()
                } catch {}
                this.signalSocket = null
            }
            throw err
        }
    }

    resetConnectionState() {
        this.connected = false
        this.playerId = null
        this.roomId = null
        this.lastInputSentAt = -Infinity
        this.lastPingSentAt = -Infinity
        this.clockOffsetMs = DEFAULT_CLOCK_OFFSET_MS
        this.clockOffsetInitialized = false
        this.rttMs = DEFAULT_RTT_MS
        this.rttJitterMs = DEFAULT_JITTER_MS
        this.snapshotBuffer.length = 0
        this.pendingInputs.length = 0
        this.pendingSnapshots.length = 0
        this.lastReconciledServerTick = -1
        this.lastCorrectionErrorUnits = 0
        this.lastCorrectionBlend = 1
        this.lastExtrapolationMs = 0
        this.lastRenderServerTimeMs = 0
        this.lastSnapshotTick = 0
        this.estimatedSnapshotIntervalMs = SNAPSHOT_INTERVAL_MS
        this.interpUnderrunBoostMs = 0
        this.staleSnapshotCount = 0
        this.lastAckedInputSeq = 0
        this.lastAckProgressAtMs = 0
        this.lastSentInputSignature = ''
        this.currentInputSendHz = INPUT_SEND_RATE_HZ
        this.remotePlayers.clear()
        this._remotePlayerCache = []
        this._remotePlayersDirty = true
    }

    handleTransportClosed() {
        const wasConnected = this.connected
        if (this.controlDataChannel) {
            try {
                this.controlDataChannel.close()
            } catch {}
            this.controlDataChannel = null
        }
        if (this.gameDataChannel) {
            try {
                this.gameDataChannel.close()
            } catch {}
            this.gameDataChannel = null
        }
        if (this.peerConnection) {
            try {
                this.peerConnection.close()
            } catch {}
            this.peerConnection = null
        }
        if (this.socket) {
            try {
                this.socket.close()
            } catch {}
            this.socket = null
        }
        this.transport = 'none'
        this.resetConnectionState()
        if (wasConnected) {
            this.handlers.onClose?.()
        }
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
                this.pendingSnapshots.push(msg)
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

    flushSnapshots() {
        if (!this.pendingSnapshots.length) return
        // Sort by tick before processing so events are always applied in tick order.
        // Critical for WebRTC (unordered channel): without this, a late-arriving
        // snapshot at tick N+1 advances lastAppliedWorldSnapshotTick, then the earlier
        // tick N snapshot hits the monotonic guard and all of its events (kills, damage,
        // sounds, rail shots) are silently discarded.
        this.pendingSnapshots.sort((a, b) => Number(a.tick ?? 0) - Number(b.tick ?? 0))
        for (const snapshot of this.pendingSnapshots) {
            this.applySnapshot(snapshot)
            this.handlers.onSnapshot?.(snapshot)
        }
        this.pendingSnapshots.length = 0
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
        this._remotePlayersDirty = true
        await ensureModelLoaded(player.model, player.skin ?? SkinId.RED)
        if (playerInfo.state) {
            applyPlayerState(player, playerInfo.state, true)
        }
    }

    removeRemotePlayer(playerId) {
        if (this.remotePlayers.delete(playerId)) {
            this._remotePlayersDirty = true
        }
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
                    this._remotePlayersDirty = true
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
        if (lastSeq > this.lastAckedInputSeq) {
            this.lastAckedInputSeq = lastSeq
            this.lastAckProgressAtMs = performance.now()
        }
        const predictedBefore = this.localPlayer ? captureMovementState(this.localPlayer) : null

        if (!this.localPlayer) return
        const savedPrevX = this.localPlayer.prevX
        const savedPrevY = this.localPlayer.prevY
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
        this.lastCorrectionBlend = 0

        if (correctionError <= this.tuning.reconcileDeadzoneUnits) {
            applyMovementState(this.localPlayer, predictedBefore)
            this.lastCorrectionBlend = 0
        } else if (correctionError >= TELEPORT_THRESHOLD_UNITS) {
            this.localPlayer.visualCorrectionX = 0
            this.localPlayer.visualCorrectionY = 0
            this.lastCorrectionBlend = 1
            this.localPlayer.prevX = this.localPlayer.x
            this.localPlayer.prevY = this.localPlayer.y
            return
        } else {
            this.localPlayer.visualCorrectionX += predictedBefore.x - correctedAfter.x
            this.localPlayer.visualCorrectionY += predictedBefore.y - correctedAfter.y
            this.lastCorrectionBlend = correctionError / TELEPORT_THRESHOLD_UNITS
        }

        this.localPlayer.prevX = savedPrevX
        this.localPlayer.prevY = savedPrevY
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
        this.updateUnderrunBoost(extrapolationMs)
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
        const serverTimeMsFromSnapshot = Number(snapshot.server_time_ms)
        const serverTimeMs = Number.isFinite(serverTimeMsFromSnapshot)
            ? serverTimeMsFromSnapshot
            : tick * SERVER_TICK_MILLIS
        if (tick <= this.lastSnapshotTick) {
            this.staleSnapshotCount++
        }
        this.lastSnapshotTick = Math.max(this.lastSnapshotTick, tick)
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
        if (!this.connected) return
        if (now - this.lastPingSentAt < PING_INTERVAL_MS) return
        this.lastPingSentAt = now
        this.sendGame(encodePing(Math.floor(now)))
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

        if (!this.clockOffsetInitialized) {
            // Cold-start: trust the first pong directly instead of EMA-ing from 0.
            // The server reports time as elapsed-ms-since-boot (e.g. 600 000 ms for a
            // 10-minute-old server). With alpha=0.12 and one ping per second the EMA
            // would need ~24 seconds to converge, during which every snapshot's
            // serverTimeMs >> targetServerTime, making remote players frozen at the
            // oldest buffered snapshot (~3 s stale once the 90-entry buffer is full).
            this.clockOffsetMs = offsetSample
            this.rttMs = rttSample
            this.clockOffsetInitialized = true
        } else {
            this.rttMs += (rttSample - this.rttMs) * alpha
            this.clockOffsetMs += (offsetSample - this.clockOffsetMs) * alpha
        }
        this.rttJitterMs += (Math.abs(rttSample - this.rttMs) - this.rttJitterMs) * beta
    }

    estimateServerNowMs(now = performance.now()) {
        return now + this.clockOffsetMs
    }

    computeInterpDelayMs() {
        const dynamicDelay =
            this.estimatedSnapshotIntervalMs * this.tuning.interpBaseSnapshots +
            this.rttMs * this.tuning.interpRttFactor +
            this.rttJitterMs * this.tuning.interpJitterFactor +
            this.interpUnderrunBoostMs
        this.interpDelayMs = clamp(dynamicDelay, this.tuning.interpMinMs, this.tuning.interpMaxMs)
        return this.interpDelayMs
    }

    updateUnderrunBoost(extrapolationMs) {
        if (extrapolationMs > 0.1) {
            const gain = extrapolationMs * this.tuning.interpUnderrunGain
            this.interpUnderrunBoostMs = clamp(
                this.interpUnderrunBoostMs + gain,
                0,
                this.tuning.interpUnderrunBoostMaxMs,
            )
            return
        }
        this.interpUnderrunBoostMs *= this.tuning.interpUnderrunDecay
        if (this.interpUnderrunBoostMs < 0.05) {
            this.interpUnderrunBoostMs = 0
        }
    }

    updateInputSendInterval(input, now) {
        const unackedInputs = Math.max(0, this.inputSeq - this.lastAckedInputSeq)
        const backlogNorm = clamp(unackedInputs / 12, 0, 1)
        const jitterNorm = clamp(this.rttJitterMs / 20, 0, 1)
        const isIdle =
            !input?.key_up &&
            !input?.key_down &&
            !input?.key_left &&
            !input?.key_right &&
            !input?.mouse_down &&
            (input?.weapon_switch ?? -1) < 0 &&
            (input?.weapon_scroll ?? 0) === 0

        let targetHz =
            this.tuning.inputBaseHz + backlogNorm * (INPUT_MAX_SEND_HZ - this.tuning.inputBaseHz)
        targetHz -= jitterNorm * (this.tuning.inputBaseHz - INPUT_MIN_SEND_HZ) * 0.4
        if (isIdle) {
            targetHz = Math.min(targetHz, this.tuning.inputIdleHz)
        }
        this.currentInputSendHz = clamp(targetHz, INPUT_MIN_SEND_HZ, INPUT_MAX_SEND_HZ)
        this.inputSendIntervalMs = 1000 / this.currentInputSendHz

        if (this.lastAckProgressAtMs === 0) {
            this.lastAckProgressAtMs = now
        }
    }

    isAckProgressStalled(now) {
        const unackedInputs = Math.max(0, this.inputSeq - this.lastAckedInputSeq)
        if (unackedInputs < this.tuning.inputAckBacklogThreshold) {
            return false
        }
        return now - this.lastAckProgressAtMs >= this.tuning.inputResendStallMs
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
    const targetAim = lerpAngle(a.aim_angle ?? 0, b.aim_angle ?? 0, t)
    player.aimAngle = lerpAngle(player.aimAngle, targetAim, REMOTE_AIM_MICRO_SMOOTH)
    applyFacingMicroSmoothing(player, b.facing_left)
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
    if (Number.isFinite(state.aim_angle)) {
        player.aimAngle = lerpAngle(player.aimAngle, state.aim_angle, REMOTE_AIM_MICRO_SMOOTH)
    }
    applyFacingMicroSmoothing(player, state.facing_left)
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

function applyFacingMicroSmoothing(player, nextFacing) {
    if (typeof nextFacing !== 'boolean') return
    if (player.facingLeft === nextFacing) {
        player._pendingFacingLeft = nextFacing
        player._pendingFacingFrames = 0
        return
    }
    if (player._pendingFacingLeft !== nextFacing) {
        player._pendingFacingLeft = nextFacing
        player._pendingFacingFrames = 1
        return
    }
    player._pendingFacingFrames = (player._pendingFacingFrames ?? 1) + 1
    if (player._pendingFacingFrames >= REMOTE_FACING_CONFIRM_FRAMES) {
        player.facingLeft = nextFacing
        player._pendingFacingFrames = 0
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

function buildInputSignature(input) {
    const angle = quantize(input?.aim_angle ?? 0, 1024)
    return [
        input?.key_up ? 1 : 0,
        input?.key_down ? 1 : 0,
        input?.key_left ? 1 : 0,
        input?.key_right ? 1 : 0,
        input?.mouse_down ? 1 : 0,
        input?.facing_left ? 1 : 0,
        input?.weapon_switch ?? -1,
        input?.weapon_scroll ?? 0,
        angle,
    ].join('|')
}

function quantize(value, scale) {
    return Math.round(value * scale) / scale
}

function normalizeTransportMode(value) {
    const mode = String(value ?? '').toLowerCase()
    if (mode === 'auto' || mode === 'webrtc' || mode === 'ws') {
        return mode
    }
    return null
}

function buildIceServers() {
    const configured = globalThis?.__NFK_ICE_SERVERS__
    if (Array.isArray(configured) && configured.length > 0) {
        return configured
    }
    return [{ urls: ['stun:stun.l.google.com:19302'] }]
}

function toRtcSignalingUrl(baseUrl) {
    try {
        const url = new URL(baseUrl, window.location.href)
        url.pathname = '/rtc'
        url.search = ''
        url.hash = ''
        return url.toString()
    } catch {
        if (baseUrl.endsWith('/ws')) {
            return `${baseUrl.slice(0, -3)}/rtc`
        }
        return `${baseUrl}/rtc`
    }
}

function waitForWebSocketOpen(socket) {
    if (socket.readyState === WebSocket.OPEN) {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const onOpen = () => resolve()
        const onError = () => reject(new Error('RTC signaling socket error'))
        socket.addEventListener('open', onOpen, { once: true })
        socket.addEventListener('error', onError, { once: true })
    })
}

function waitForIceGatheringComplete(peerConnection) {
    if (peerConnection.iceGatheringState === 'complete') {
        return Promise.resolve()
    }
    return new Promise((resolve) => {
        const onChange = () => {
            if (peerConnection.iceGatheringState === 'complete') {
                peerConnection.removeEventListener('icegatheringstatechange', onChange)
                resolve()
            }
        }
        peerConnection.addEventListener('icegatheringstatechange', onChange)
    })
}

function waitForDataChannelOpen(dataChannel) {
    if (dataChannel.readyState === 'open') {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('RTC datachannel open timeout')), 15000)
        dataChannel.addEventListener(
            'open',
            () => {
                clearTimeout(timeout)
                resolve()
            },
            { once: true },
        )
        dataChannel.addEventListener(
            'close',
            () => {
                clearTimeout(timeout)
                reject(new Error('RTC datachannel closed before open'))
            },
            { once: true },
        )
        dataChannel.addEventListener(
            'error',
            () => {
                clearTimeout(timeout)
                reject(new Error('RTC datachannel error before open'))
            },
            { once: true },
        )
    })
}

function waitForRtcAnswer(signalSocket, timeoutMs) {
    return new Promise((resolve, reject) => {
        let settled = false
        const cleanup = () => {
            signalSocket.removeEventListener('message', onMessage)
            signalSocket.removeEventListener('close', onClose)
            signalSocket.removeEventListener('error', onError)
            clearTimeout(timeout)
        }
        const finish = (fn, value) => {
            if (settled) return
            settled = true
            cleanup()
            fn(value)
        }
        const onMessage = (event) => {
            try {
                const msg = JSON.parse(String(event.data))
                if (msg?.type === 'answer' && typeof msg?.sdp === 'string') {
                    finish(resolve, msg.sdp)
                    return
                }
                if (msg?.type === 'error') {
                    finish(reject, new Error(msg.message ?? 'RTC signaling error'))
                }
            } catch (err) {
                finish(reject, err)
            }
        }
        const onClose = () =>
            finish(reject, new Error('RTC signaling socket closed during negotiation'))
        const onError = () =>
            finish(reject, new Error('RTC signaling socket error during negotiation'))
        const timeout = setTimeout(
            () => finish(reject, new Error('RTC answer timeout after 10s')),
            timeoutMs,
        )

        signalSocket.addEventListener('message', onMessage)
        signalSocket.addEventListener('close', onClose)
        signalSocket.addEventListener('error', onError)
    })
}
