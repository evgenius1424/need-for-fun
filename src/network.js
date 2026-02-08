import { ensureModelLoaded } from './assets'
import { Player } from './player'
import { SkinId } from './models'
import {
    decodeServerMessage,
    encodeHello,
    encodeInput,
    encodeJoinRoom,
    initBinaryProtocol,
} from './binaryProtocolWasm'

const DEFAULT_SERVER_URL = 'ws://localhost:3001/ws'
const DEFAULT_MAP = 'dm2'

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
        this.interpDelayMs = 100
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

    async connect({ url = DEFAULT_SERVER_URL, username, roomId, map = DEFAULT_MAP } = {}) {
        if (this.connected) return
        if (!username) throw new Error('Username required')

        // Initialize WASM binary protocol before connecting
        await initBinaryProtocol()

        return new Promise((resolve, reject) => {
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
        })
    }

    disconnect() {
        if (this.socket) {
            this.socket.close()
        }
    }

    sendInput(input) {
        if (!this.connected || !this.socket) return
        this.inputSeq++
        this.pendingInputs.push({ seq: this.inputSeq, input })
        this.send(encodeInput(this.inputSeq, input))
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
        this.snapshotBuffer.push({
            time: performance.now(),
            players: snapshot.players,
        })
        if (this.snapshotBuffer.length > 30) {
            this.snapshotBuffer.shift()
        }

        for (const state of snapshot.players) {
            if (state.id === this.playerId && this.localPlayer) {
                applyPlayerState(this.localPlayer, state, false)
                this.reconcileLocal(state)
            } else {
                let player = this.remotePlayers.get(state.id)
                if (!player) {
                    player = new Player()
                    player.id = state.id
                    this.remotePlayers.set(state.id, player)
                }
                applyPlayerState(player, state, true)
            }
        }
    }

    reconcileLocal(serverState) {
        const lastSeq = serverState.last_input_seq ?? 0
        if (!this.pendingInputs.length) return

        this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > lastSeq)

        if (!this.predictor || !this.localPlayer) return
        for (const entry of this.pendingInputs) {
            this.predictor(this.localPlayer, entry.input)
        }
    }

    updateInterpolation(now = performance.now()) {
        if (!this.snapshotBuffer.length) return

        const targetTime = now - this.interpDelayMs
        let older = null
        let newer = null

        for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
            const snap = this.snapshotBuffer[i]
            if (snap.time <= targetTime) {
                older = snap
                newer = this.snapshotBuffer[i + 1] ?? snap
                break
            }
        }

        if (!older) {
            older = this.snapshotBuffer[0]
            newer = this.snapshotBuffer[1] ?? older
        }

        const span = Math.max(1, newer.time - older.time)
        const t = Math.min(1, Math.max(0, (targetTime - older.time) / span))

        const olderMap = toPlayerMap(older.players)
        const newerMap = toPlayerMap(newer.players)

        for (const [id, player] of this.remotePlayers.entries()) {
            const a = olderMap.get(id)
            const b = newerMap.get(id) ?? a
            if (!a || !b) continue
            applyInterpolatedState(player, a, b, t)
        }
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
