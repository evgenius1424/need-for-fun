import { getBackendHttpBaseUrl } from './wsEndpoint'

async function parseJson(response) {
    const text = await response.text()
    if (!text) return null

    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

function roomApiError(message, code) {
    const err = new Error(message)
    err.code = code
    return err
}

export async function listRooms() {
    const response = await fetch(`${getBackendHttpBaseUrl()}/api/rooms`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    })

    const body = await parseJson(response)

    if (!response.ok) {
        throw roomApiError(body?.message ?? 'Failed to list rooms', body?.error)
    }

    return body?.rooms ?? []
}

export async function createRoom(input) {
    const payload = {
        name: input.name,
        maxPlayers: input.maxPlayers,
        mapId: input.mapId,
        mode: input.mode,
        tickRate: input.tickRate,
        protocolVersion: input.protocolVersion,
        region: input.region,
    }

    const response = await fetch(`${getBackendHttpBaseUrl()}/api/rooms`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    const body = await parseJson(response)

    if (!response.ok) {
        throw roomApiError(body?.message ?? 'Failed to create room', body?.error)
    }

    return body?.room
}
