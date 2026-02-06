const FRAME_MS = 16
const MAX_TICKS_PER_FRAME = 5

const runtime = {
    time: 0,
    alpha: 1,
    kernel: null,
    map: null,
    scratchInput: null,
    scratchOutput: null,
    playerStates: new Map(),
}

// Constants loaded from WASM - single source of truth from Rust
export let PhysicsConstants = null

async function initKernel() {
    const module = await import('../wasm/physics_core.js')
    await module.default()
    runtime.kernel = new module.WasmPhysicsKernel()
    runtime.map = null
    runtime.scratchInput = new module.WasmPlayerInput()
    runtime.scratchOutput = new Float32Array(12)
    runtime.WasmMap = module.WasmMap
    runtime.WasmPlayerState = module.WasmPlayerState

    // Load all constants from WASM - Rust physics_core/src/constants.rs is the source of truth
    PhysicsConstants = {
        // Projectile physics
        GRAVITY: module.get_projectile_gravity(),
        BOUNCE_DECAY: module.get_bounce_decay(),
        GRENADE_FUSE: module.get_grenade_fuse(),
        GRENADE_MIN_VELOCITY: module.get_grenade_min_velocity(),
        BOUNDS_MARGIN: module.get_bounds_margin(),
        SELF_HIT_GRACE: module.get_self_hit_grace(),
        GRENADE_HIT_GRACE: module.get_grenade_hit_grace(),
        EXPLOSION_RADIUS: module.get_explosion_radius(),

        // Weapon ranges
        SHAFT_RANGE: module.get_shaft_range(),
        SHOTGUN_RANGE: module.get_shotgun_range(),
        SHOTGUN_PELLETS: module.get_shotgun_pellets(),
        SHOTGUN_SPREAD: module.get_shotgun_spread(),
        GAUNTLET_RANGE: module.get_gauntlet_range(),
        GRENADE_LOFT: module.get_grenade_loft(),
        MACHINE_RANGE: module.get_machine_range(),
        RAIL_RANGE: module.get_rail_range(),

        // Hit radii - note: get_hit_radius_rocket has a wasm-bindgen bug, use get_hit_radius_bfg value (both are 28)
        HIT_RADIUS: {
            rocket: module.get_hit_radius_bfg(), // Both rocket and bfg are 28.0 in Rust
            bfg: module.get_hit_radius_bfg(),
            grenade: module.get_hit_radius_grenade(),
            plasma: module.get_hit_radius_plasma(),
        },

        // Weapon stats (indexed by WeaponId)
        getDamage: module.get_damage,
        getFireRate: module.get_fire_rate,
        getProjectileSpeed: module.get_projectile_speed,
    }
}

await initKernel()

export const Physics = {
    setMap(rows, cols, bricksFlat) {
        const map = new runtime.WasmMap(rows, cols)
        map.upload_bricks(bricksFlat)
        runtime.map = map
        runtime.playerStates.clear()
    },

    updateAllPlayers(players, timestamp) {
        if (!runtime.map) return false
        if (runtime.time === 0) runtime.time = timestamp - FRAME_MS

        const delta = timestamp - runtime.time
        let frames = Math.trunc(delta / FRAME_MS)
        if (frames === 0) {
            runtime.alpha = delta / FRAME_MS
            return false
        }

        if (frames > MAX_TICKS_PER_FRAME) {
            frames = MAX_TICKS_PER_FRAME
            runtime.time = timestamp - frames * FRAME_MS
        }

        runtime.time += frames * FRAME_MS

        while (frames-- > 0) {
            for (const player of players) {
                stepPlayer(player)
            }
        }

        runtime.alpha = (timestamp - runtime.time) / FRAME_MS
        return true
    },

    stepPlayers(players, frames = 1) {
        if (!runtime.map) return
        let remaining = Math.max(0, frames | 0)
        while (remaining-- > 0) {
            for (const player of players) {
                stepPlayer(player)
            }
        }
    },

    getAlpha() {
        return runtime.alpha
    },
}

function stepPlayer(player) {
    let entry = runtime.playerStates.get(player.id)
    if (!entry) {
        entry = createEntry(player)
        runtime.playerStates.set(player.id, entry)
    }

    if (hasHostDiverged(player, entry.mirror)) {
        entry.state.import_host_state(
            player.x,
            player.y,
            player.prevX,
            player.prevY,
            player.velocityX,
            player.velocityY,
            player.crouch,
            player.doublejumpCountdown,
            player.speedJump,
            player.dead,
            runtime.map,
        )
    }

    runtime.scratchInput.set(player.keyUp, player.keyDown, player.keyLeft, player.keyRight)
    runtime.kernel.step_player(entry.state, runtime.scratchInput, runtime.map)

    entry.state.export_to_host(runtime.scratchOutput)
    applyOutput(player, entry.mirror, runtime.scratchOutput)
}

function createEntry(player) {
    const state = new runtime.WasmPlayerState(toWasmPlayerId(player.id))
    state.import_host_state(
        player.x,
        player.y,
        player.prevX,
        player.prevY,
        player.velocityX,
        player.velocityY,
        player.crouch,
        player.doublejumpCountdown,
        player.speedJump,
        player.dead,
        runtime.map,
    )
    return {
        state,
        mirror: {
            x: player.x,
            y: player.y,
            prevX: player.prevX,
            prevY: player.prevY,
            velocityX: player.velocityX,
            velocityY: player.velocityY,
            crouch: player.crouch,
            doublejumpCountdown: player.doublejumpCountdown,
            speedJump: player.speedJump,
            dead: player.dead,
        },
    }
}

function toWasmPlayerId(value) {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number') return BigInt(Math.trunc(value))
    if (typeof value === 'string') return BigInt(value)
    return 0n
}

function hasHostDiverged(player, mirror) {
    return (
        player.x !== mirror.x ||
        player.y !== mirror.y ||
        player.prevX !== mirror.prevX ||
        player.prevY !== mirror.prevY ||
        player.velocityX !== mirror.velocityX ||
        player.velocityY !== mirror.velocityY ||
        player.crouch !== mirror.crouch ||
        player.doublejumpCountdown !== mirror.doublejumpCountdown ||
        player.speedJump !== mirror.speedJump ||
        player.dead !== mirror.dead
    )
}

function applyOutput(player, mirror, out) {
    player.x = out[0]
    player.y = out[1]
    player.prevX = out[2]
    player.prevY = out[3]
    player.velocityX = out[4]
    player.velocityY = out[5]
    player.crouch = out[6] !== 0
    player.doublejumpCountdown = out[7] | 0
    player.speedJump = out[8] | 0
    player.cacheOnGround = out[9] !== 0
    player.cacheBrickOnHead = out[10] !== 0
    player.cacheBrickCrouchOnHead = out[11] !== 0

    mirror.x = player.x
    mirror.y = player.y
    mirror.prevX = player.prevX
    mirror.prevY = player.prevY
    mirror.velocityX = player.velocityX
    mirror.velocityY = player.velocityY
    mirror.crouch = player.crouch
    mirror.doublejumpCountdown = player.doublejumpCountdown
    mirror.speedJump = player.speedJump
    mirror.dead = player.dead
}
