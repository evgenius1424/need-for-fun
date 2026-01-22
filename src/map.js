import { Console, MapEditor } from './helpers'

let rows = 0
let cols = 0
let bricks = []
let tileColors = [] // Store tile colors for team coloring
const respawns = []
const items = []

// Team colors
const TEAM_COLORS = {
    neutral: null, // No tint (uses default texture color)
    red: 0xff4444,
    blue: 0x4444ff,
}

function parseMapText(mapText) {
    const lines = mapText.replaceAll('\r', '').split('\n')
    rows = lines.length
    cols = Math.max(...lines.map((line) => line.length))
    bricks = []
    tileColors = []
    respawns.length = 0
    items.length = 0

    const itemTokens = {
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

    for (let row = 0; row < rows; row++) {
        const line = lines[row] ?? ''
        bricks[row] = []
        tileColors[row] = []
        for (let col = 0; col < cols; col++) {
            const char = line[col] ?? ' '
            const itemType = itemTokens[char]
            // '0' = neutral brick, '1' = red brick, '2' = blue brick
            const isBrickTile = char === '0' || char === '1' || char === '2'
            bricks[row][col] = isBrickTile

            // Assign team color based on tile type
            if (char === '1') {
                tileColors[row][col] = TEAM_COLORS.red
            } else if (char === '2') {
                tileColors[row][col] = TEAM_COLORS.blue
            } else {
                tileColors[row][col] = TEAM_COLORS.neutral
            }

            if (char === 'R') respawns.push({ row, col })
            if (itemType) {
                items.push({
                    type: itemType,
                    row,
                    col,
                    active: true,
                    respawnTimer: 0,
                })
            }
        }
    }
}

export const Map = {
    async loadFromQuery() {
        const params = new URLSearchParams(location.search)
        let mapText

        if (params.has('maptext')) {
            mapText = params.get('maptext')
            MapEditor.show()
            Console.writeText('map loaded from url')
        } else {
            const mapFile = params.get('mapfile') ?? 'dm2'
            const response = await fetch(`/maps/${mapFile}.txt`)

            if (!response.ok) {
                Console.writeText(`failed to load map: ${mapFile}`)
                return
            }

            mapText = await response.text()
            Console.writeText(`map loaded: ${mapFile}`)
        }

        MapEditor.setContent(mapText)
        parseMapText(mapText)
    },

    isBrick(col, row) {
        return row < 0 || col < 0 || row >= rows || col >= cols || bricks[row][col]
    },

    getTileColor(col, row) {
        if (row < 0 || col < 0 || row >= rows || col >= cols) return null
        return tileColors[row]?.[col] ?? null
    },

    getRows: () => rows,
    getCols: () => cols,

    getRandomRespawn() {
        return respawns[(Math.random() * respawns.length) | 0]
    },

    getItems() {
        return items
    },
}
