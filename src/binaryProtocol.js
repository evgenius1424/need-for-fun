export const MSG = {
    HELLO: 0x01,
    JOIN_ROOM: 0x02,
    INPUT: 0x03,
    WELCOME: 0x81,
    ROOM_STATE: 0x82,
    PLAYER_JOINED: 0x83,
    PLAYER_LEFT: 0x84,
    SNAPSHOT: 0x85,
}

const EVENT = {
    WEAPON_FIRED: 0x01,
    PROJECTILE_SPAWN: 0x02,
    RAIL: 0x03,
    SHAFT: 0x04,
    BULLET_IMPACT: 0x05,
    GAUNTLET: 0x06,
    EXPLOSION: 0x07,
    DAMAGE: 0x08,
}

const PROJ_KIND = ['rocket', 'grenade', 'plasma', 'bfg']

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const inputBuffer = new ArrayBuffer(16)
const inputView = new DataView(inputBuffer)

export function encodeHello(username) {
    const nameBytes = textEncoder.encode(username ?? '')
    const len = Math.min(32, nameBytes.length)
    const buffer = new ArrayBuffer(2 + len)
    const view = new DataView(buffer)
    view.setUint8(0, MSG.HELLO)
    view.setUint8(1, len)
    new Uint8Array(buffer, 2, len).set(nameBytes.subarray(0, len))
    return buffer
}

export function encodeJoinRoom(roomId, map) {
    const roomBytes = textEncoder.encode(roomId ?? '')
    const mapBytes = textEncoder.encode(map ?? '')
    const roomLen = Math.min(255, roomBytes.length)
    const mapLen = Math.min(255, mapBytes.length)
    const buffer = new ArrayBuffer(3 + roomLen + mapLen)
    const view = new DataView(buffer)
    view.setUint8(0, MSG.JOIN_ROOM)
    view.setUint8(1, roomLen)
    view.setUint8(2, mapLen)
    let offset = 3
    new Uint8Array(buffer, offset, roomLen).set(roomBytes.subarray(0, roomLen))
    offset += roomLen
    new Uint8Array(buffer, offset, mapLen).set(mapBytes.subarray(0, mapLen))
    return buffer
}

export function encodeInput(seq, input) {
    inputView.setUint8(0, MSG.INPUT)
    inputView.setBigUint64(1, BigInt(seq), true)
    inputView.setFloat32(9, input.aim_angle ?? 0, true)

    let flags = 0
    if (input.key_up) flags |= 0x01
    if (input.key_down) flags |= 0x02
    if (input.key_left) flags |= 0x04
    if (input.key_right) flags |= 0x08
    if (input.mouse_down) flags |= 0x10
    if (input.facing_left) flags |= 0x20
    inputView.setUint8(13, flags)

    inputView.setInt8(14, input.weapon_switch ?? -1)
    inputView.setInt8(15, input.weapon_scroll ?? 0)
    return inputBuffer
}

export function decodeServerMessage(buffer) {
    const view = new DataView(buffer)
    const type = view.getUint8(0)
    switch (type) {
        case MSG.WELCOME:
            return { type: 'welcome', player_id: readU64(view, 1) }
        case MSG.ROOM_STATE:
            return decodeRoomState(view)
        case MSG.PLAYER_JOINED:
            return decodePlayerJoined(view)
        case MSG.PLAYER_LEFT:
            return { type: 'player_left', player_id: readU64(view, 1) }
        case MSG.SNAPSHOT:
            return decodeSnapshot(view)
        default:
            return null
    }
}

function decodeRoomState(view) {
    const roomLen = view.getUint8(1)
    const mapLen = view.getUint8(2)
    const playerCount = view.getUint8(3)
    let offset = 4
    const room_id = readString(view, offset, roomLen)
    offset += roomLen
    const map = readString(view, offset, mapLen)
    offset += mapLen

    const players = []
    for (let i = 0; i < playerCount; i++) {
        const nameLen = view.getUint8(offset)
        offset += 1
        const username = readString(view, offset, nameLen)
        offset += nameLen
        const { snapshot, bytesRead } = decodePlayerRecord(view, offset)
        offset += bytesRead
        players.push({
            id: snapshot.id,
            username,
            model: null,
            skin: null,
            state: snapshot,
        })
    }

    return { type: 'room_state', room_id, map, players }
}

function decodePlayerJoined(view) {
    const player_id = readU64(view, 1)
    const nameLen = view.getUint8(9)
    const username = readString(view, 10, nameLen)
    return {
        type: 'player_joined',
        player: {
            id: player_id,
            username,
            model: null,
            skin: null,
            state: null,
        },
    }
}

function decodeSnapshot(view) {
    const tick = readU64(view, 1)
    const playerCount = view.getUint8(9)
    const itemCount = view.getUint8(10)
    const projectileCount = view.getUint16(11, true)
    const eventCount = view.getUint8(13)
    let offset = 14

    const players = []
    for (let i = 0; i < playerCount; i++) {
        const { snapshot, bytesRead } = decodePlayerRecord(view, offset)
        offset += bytesRead
        players.push(snapshot)
    }

    const items = []
    for (let i = 0; i < itemCount; i++) {
        const flags = view.getUint8(offset)
        const active = (flags & 0x01) !== 0
        const respawn_timer = view.getInt16(offset + 1, true)
        offset += 3
        items.push({ active, respawn_timer })
    }

    const projectiles = []
    for (let i = 0; i < projectileCount; i++) {
        const id = readU64(view, offset)
        const x = view.getFloat32(offset + 8, true)
        const y = view.getFloat32(offset + 12, true)
        const velocity_x = view.getFloat32(offset + 16, true)
        const velocity_y = view.getFloat32(offset + 20, true)
        const owner_id = readI64(view, offset + 24)
        const kind = view.getUint8(offset + 32)
        offset += 33
        projectiles.push({
            id,
            x,
            y,
            velocity_x,
            velocity_y,
            owner_id,
            type: PROJ_KIND[kind] ?? 'rocket',
        })
    }

    const events = []
    for (let i = 0; i < eventCount; i++) {
        const { event, bytesRead } = decodeEvent(view, offset)
        offset += bytesRead
        if (event) events.push(event)
    }

    return { type: 'snapshot', tick, players, items, projectiles, events }
}

function decodePlayerRecord(view, offset) {
    const id = readU64(view, offset)
    const x = view.getFloat32(offset + 8, true)
    const y = view.getFloat32(offset + 12, true)
    const vx = view.getFloat32(offset + 16, true)
    const vy = view.getFloat32(offset + 20, true)
    const aim_angle = view.getFloat32(offset + 24, true)
    const health = view.getInt16(offset + 28, true)
    const armor = view.getInt16(offset + 30, true)
    const current_weapon = view.getUint8(offset + 32)
    const fire_cooldown = view.getUint8(offset + 33)
    const weapon_bits = view.getUint16(offset + 34, true)

    const ammo = []
    let ammoOffset = offset + 36
    for (let i = 0; i < 9; i++) {
        ammo.push(view.getInt16(ammoOffset, true))
        ammoOffset += 2
    }

    const last_input_seq = readU64(view, offset + 54)
    const flags = view.getUint8(offset + 62)
    const facing_left = (flags & 0x01) !== 0
    const crouch = (flags & 0x02) !== 0
    const dead = (flags & 0x04) !== 0
    const key_left = (flags & 0x08) !== 0
    const key_right = (flags & 0x10) !== 0
    const key_up = (flags & 0x20) !== 0
    const key_down = (flags & 0x40) !== 0

    const weapons = []
    for (let i = 0; i < 9; i++) {
        weapons.push((weapon_bits & (1 << i)) !== 0)
    }

    return {
        snapshot: {
            id,
            x,
            y,
            vx,
            vy,
            aim_angle,
            facing_left,
            crouch,
            dead,
            health,
            armor,
            current_weapon,
            fire_cooldown,
            weapons,
            ammo,
            last_input_seq,
            key_left,
            key_right,
            key_up,
            key_down,
        },
        bytesRead: 63,
    }
}

function decodeEvent(view, offset) {
    const type = view.getUint8(offset)
    switch (type) {
        case EVENT.WEAPON_FIRED: {
            const player_id = readU64(view, offset + 1)
            const weapon_id = view.getUint8(offset + 9)
            return {
                event: { type: 'weapon_fired', player_id, weapon_id },
                bytesRead: 10,
            }
        }
        case EVENT.PROJECTILE_SPAWN: {
            const id = readU64(view, offset + 1)
            const kind = view.getUint8(offset + 9)
            const x = view.getFloat32(offset + 10, true)
            const y = view.getFloat32(offset + 14, true)
            const velocity_x = view.getFloat32(offset + 18, true)
            const velocity_y = view.getFloat32(offset + 22, true)
            const owner_id = readU64(view, offset + 26)
            return {
                event: {
                    type: 'projectile_spawn',
                    id,
                    kind: PROJ_KIND[kind] ?? 'rocket',
                    x,
                    y,
                    velocity_x,
                    velocity_y,
                    owner_id,
                },
                bytesRead: 34,
            }
        }
        case EVENT.RAIL: {
            const start_x = view.getFloat32(offset + 1, true)
            const start_y = view.getFloat32(offset + 5, true)
            const end_x = view.getFloat32(offset + 9, true)
            const end_y = view.getFloat32(offset + 13, true)
            return {
                event: { type: 'rail', start_x, start_y, end_x, end_y },
                bytesRead: 17,
            }
        }
        case EVENT.SHAFT: {
            const start_x = view.getFloat32(offset + 1, true)
            const start_y = view.getFloat32(offset + 5, true)
            const end_x = view.getFloat32(offset + 9, true)
            const end_y = view.getFloat32(offset + 13, true)
            return {
                event: { type: 'shaft', start_x, start_y, end_x, end_y },
                bytesRead: 17,
            }
        }
        case EVENT.BULLET_IMPACT: {
            const x = view.getFloat32(offset + 1, true)
            const y = view.getFloat32(offset + 5, true)
            const radius = view.getFloat32(offset + 9, true)
            return {
                event: { type: 'bullet_impact', x, y, radius },
                bytesRead: 13,
            }
        }
        case EVENT.GAUNTLET: {
            const x = view.getFloat32(offset + 1, true)
            const y = view.getFloat32(offset + 5, true)
            return {
                event: { type: 'gauntlet', x, y },
                bytesRead: 9,
            }
        }
        case EVENT.EXPLOSION: {
            const x = view.getFloat32(offset + 1, true)
            const y = view.getFloat32(offset + 5, true)
            const kind = view.getUint8(offset + 9)
            return {
                event: { type: 'explosion', x, y, kind: PROJ_KIND[kind] ?? 'rocket' },
                bytesRead: 10,
            }
        }
        case EVENT.DAMAGE: {
            const attacker_id = readU64(view, offset + 1)
            const target_id = readU64(view, offset + 9)
            const amount = view.getInt16(offset + 17, true)
            const flags = view.getUint8(offset + 19)
            return {
                event: {
                    type: 'damage',
                    attacker_id,
                    target_id,
                    amount,
                    killed: (flags & 0x01) !== 0,
                },
                bytesRead: 20,
            }
        }
        default:
            return { event: null, bytesRead: 1 }
    }
}

function readString(view, offset, len) {
    if (len <= 0) return ''
    return textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset, len))
}

function readU64(view, offset) {
    return Number(view.getBigUint64(offset, true))
}

function readI64(view, offset) {
    return Number(view.getBigInt64(offset, true))
}
