import { Console, MapEditor } from './helpers'

const TEAM_COLORS = { neutral: null, red: 0xff4444, blue: 0x4444ff }

const BRICK_CHARS = { 0: 'neutral', 1: 'red', 2: 'blue' }

const ITEM_TOKENS = {
    H: 'health100',
    h: 'health25',
    5: 'health5',
    6: 'health50',
    A: 'armor100',
    a: 'armor50',
    Q: 'quad',
    M: 'weapon_machine',
    T: 'weapon_shotgun',
    3: 'weapon_grenade',
    4: 'weapon_rocket',
}

const state = { rows: 0, cols: 0, bricks: [], colors: [], respawns: [], items: [] }

export const Map = {
    async loadFromQuery() {
        const params = new URLSearchParams(location.search)
        const mapText = params.has('maptext')
            ? loadFromUrl(params.get('maptext'))
            : await loadFromFile(params.get('mapfile') ?? 'dm2')

        if (mapText) {
            MapEditor.setContent(mapText)
            parseMapText(mapText)
        }
    },

    isBrick(col, row) {
        const { rows, cols, bricks } = state
        return row < 0 || col < 0 || row >= rows || col >= cols || bricks[row][col]
    },

    getTileColor(col, row) {
        const { rows, cols, colors } = state
        if (row < 0 || col < 0 || row >= rows || col >= cols) return null
        return colors[row]?.[col] ?? null
    },

    getRows: () => state.rows,
    getCols: () => state.cols,
    getItems: () => state.items,

    getRandomRespawn() {
        const { respawns } = state
        if (!respawns.length) {
            Console.writeText('no respawn points loaded')
            return { row: 0, col: 0 }
        }
        return respawns[(Math.random() * respawns.length) | 0]
    },
}

function loadFromUrl(mapText) {
    MapEditor.show()
    Console.writeText('map loaded from url')
    return mapText
}

async function loadFromFile(mapFile) {
    try {
        const response = await fetch(`/maps/${mapFile}.txt`)

        if (!response.ok) {
            Console.writeText(`failed to load map: ${mapFile}`)
            return null
        }

        Console.writeText(`map loaded: ${mapFile}`)
        return response.text()
    } catch (err) {
        Console.writeText(`map load error: ${err?.message ?? err}`)
        return null
    }
}

function parseMapText(mapText) {
    const lines = mapText.replaceAll('\r', '').split('\n')

    state.rows = lines.length
    state.cols = Math.max(...lines.map((l) => l.length))
    state.bricks = []
    state.colors = []
    state.respawns = []
    state.items = []

    for (let row = 0; row < state.rows; row++) {
        const line = lines[row] ?? ''
        state.bricks[row] = []
        state.colors[row] = []

        for (let col = 0; col < state.cols; col++) {
            const char = line[col] ?? ' '

            const team = BRICK_CHARS[char]
            state.bricks[row][col] = !!team
            state.colors[row][col] = team ? TEAM_COLORS[team] : null

            if (char === 'R') {
                state.respawns.push({ row, col })
            }

            const itemType = ITEM_TOKENS[char]
            if (itemType) {
                state.items.push({ type: itemType, row, col, active: true, respawnTimer: 0 })
            }
        }
    }
}
