#!/usr/bin/env node
import fs from 'node:fs'

if (process.argv.length < 4) {
    console.error('Usage: node scripts/compare-physics-recordings.mjs <legacy.json> <wasm.json>')
    process.exit(1)
}

const legacy = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const wasm = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))

const count = Math.min(legacy.length, wasm.length)
let diffs = 0

for (let i = 0; i < count; i++) {
    const a = legacy[i]
    const b = wasm[i]

    const dx = Math.abs((a.x ?? 0) - (b.x ?? 0))
    const dy = Math.abs((a.y ?? 0) - (b.y ?? 0))
    const dvx = Math.abs((a.vx ?? 0) - (b.vx ?? 0))
    const dvy = Math.abs((a.vy ?? 0) - (b.vy ?? 0))

    if (dx > 1e-5 || dy > 1e-5 || dvx > 1e-5 || dvy > 1e-5) {
        diffs++
        console.log(
            `tick=${i} dx=${dx.toFixed(6)} dy=${dy.toFixed(6)} dvx=${dvx.toFixed(6)} dvy=${dvy.toFixed(6)}`,
        )
    }
}

console.log(`Compared ${count} ticks, mismatches: ${diffs}`)
