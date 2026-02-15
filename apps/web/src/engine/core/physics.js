import { getWasmModuleSync, initWasm } from '../wasmClient'

const FRAME_MS = 16
const MAX_TICKS_PER_FRAME = 5

const runtime = {
    time: 0,
    alpha: 1,
    module: null,
    kernel: null,
    map: null,
    mapRows: 0,
    mapCols: 0,
    scratchInput: null,
    scratchOutput: null,
    playerStates: new Map(),
}

// Constants loaded from WASM - single source of truth from Rust
export let PhysicsConstants = null

async function initKernel() {
    await initWasm()
    const module = getWasmModuleSync()
    runtime.module = module
    runtime.kernel = new module.WasmPhysicsKernel()
    runtime.map = null
    runtime.scratchInput = new module.WasmPlayerInput()
    runtime.scratchOutput = new Float32Array(12)
    runtime.WasmMap = module.WasmMap
    runtime.WasmPlayerState = module.WasmPlayerState
    runtime.WasmProjectile = module.WasmProjectile
    runtime.rayTracer = new module.WasmRayTracer()
    runtime.weaponKernel = new module.WasmWeaponKernel()
    runtime.projectileSpawnOut = {
        kind: 0,
        x: 0,
        y: 0,
        velocityX: 0,
        velocityY: 0,
    }

    // Load all constants from WASM - Rust physics_core/src/constants.rs is the source of truth
    const weaponCount = module.get_weapon_count()
    PhysicsConstants = {
        WEAPON_COUNT: weaponCount,
        // Projectile physics
        GRAVITY: module.get_projectile_gravity(),
        GRENADE_FUSE: module.get_grenade_fuse(),
        GRENADE_MIN_VELOCITY: module.get_grenade_min_velocity(),
        GRENADE_AIR_FRICTION: module.get_grenade_air_friction(),
        GRENADE_BOUNCE_FRICTION: module.get_grenade_bounce_friction(),
        GRENADE_RISE_DAMPING: module.get_grenade_rise_damping(),
        GRENADE_MAX_FALL_SPEED: module.get_grenade_max_fall_speed(),
        BOUNDS_MARGIN: module.get_bounds_margin(),
        SELF_HIT_GRACE: module.get_self_hit_grace(),
        GRENADE_HIT_GRACE: module.get_grenade_hit_grace(),
        EXPLOSION_RADIUS: module.get_explosion_radius(),
        PLASMA_SPLASH_DMG: module.get_plasma_splash_damage(),
        PLASMA_SPLASH_RADIUS: module.get_plasma_splash_radius(),
        PLASMA_SPLASH_PUSH: module.get_plasma_splash_push(),

        // Weapon ranges
        SHAFT_RANGE: module.get_shaft_range(),
        SHOTGUN_RANGE: module.get_shotgun_range(),
        SHOTGUN_PELLETS: module.get_shotgun_pellets(),
        SHOTGUN_SPREAD: module.get_shotgun_spread(),
        GAUNTLET_RANGE: module.get_gauntlet_range(),
        GRENADE_LOFT: module.get_grenade_loft(),
        MACHINE_RANGE: module.get_machine_range(),
        RAIL_RANGE: module.get_rail_range(),

        // Hit radii
        HIT_RADIUS: {
            rocket: module.get_hit_radius_rocket(),
            bfg: module.get_hit_radius_bfg(),
            grenade: module.get_hit_radius_grenade(),
            plasma: module.get_hit_radius_plasma(),
        },

        // Weapon stats (indexed by WeaponId)
        getDamage: module.get_damage,
        getFireRate: module.get_fire_rate,
        getProjectileSpeed: module.get_projectile_speed,
        getProjectileOffset: module.get_projectile_offset,
        getWeaponPush: module.get_weapon_push,
        getSplashRadius: module.get_splash_radius,
        getDefaultAmmo: module.get_default_ammo,
        getPickupAmmo: module.get_pickup_ammo,
        DEFAULT_AMMO: Array.from({ length: weaponCount }, (_, i) => module.get_default_ammo(i)),
        PICKUP_AMMO: Array.from({ length: weaponCount }, (_, i) => module.get_pickup_ammo(i)),
        PROJECTILE_OFFSET: Array.from({ length: weaponCount }, (_, i) =>
            module.get_projectile_offset(i),
        ),

        // Game constants
        MAX_HEALTH: module.get_max_health(),
        MAX_ARMOR: module.get_max_armor(),
        MEGA_HEALTH: module.get_mega_health(),
        ARMOR_ABSORPTION: module.get_armor_absorption(),
        SELF_DAMAGE_REDUCTION: module.get_self_damage_reduction(),
        QUAD_MULTIPLIER: module.get_quad_multiplier(),
        QUAD_DURATION: module.get_quad_duration(),
        GIB_THRESHOLD: -40,
        RESPAWN_TIME: module.get_respawn_time(),
        SPAWN_PROTECTION: module.get_spawn_protection(),
        PLAYER_HALF_H: module.get_player_half_h(),
        SPAWN_OFFSET_X: module.get_spawn_offset_x(),
        PICKUP_RADIUS: module.get_pickup_radius(),
        HITSCAN_PLAYER_RADIUS: module.get_hitscan_player_radius(),
        GAUNTLET_PLAYER_RADIUS: module.get_gauntlet_player_radius(),
        WEAPON_ORIGIN_CROUCH_LIFT: module.get_weapon_origin_crouch_lift(),

        // Tile sizes (for validation)
        TILE_W: module.get_tile_w(),
        TILE_H: module.get_tile_h(),
    }

}

await initKernel()

export const Physics = {
    setMap(rows, cols, bricksFlat) {
        runtime.map?.free()
        const map = new runtime.WasmMap(rows, cols)
        map.upload_bricks(bricksFlat)
        runtime.map = map
        runtime.mapRows = rows
        runtime.mapCols = cols
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

    hasMap() {
        return !!runtime.map
    },

    createWasmProjectile(id, kind, x, y, velocityX, velocityY, ownerId) {
        return new runtime.WasmProjectile(id, kind, x, y, velocityX, velocityY, ownerId)
    },

    stepWasmProjectile(projectile) {
        if (!runtime.map || !projectile) return false
        return projectile.step(runtime.map, runtime.mapCols, runtime.mapRows)
    },

    rayTrace(startX, startY, angle, maxDistance) {
        if (!runtime.map) {
            return {
                hit: false,
                hitWall: false,
                x: startX + Math.cos(angle) * maxDistance,
                y: startY + Math.sin(angle) * maxDistance,
                distance: maxDistance,
            }
        }

        runtime.rayTracer.trace(runtime.map, startX, startY, angle, maxDistance)
        const hitWall = runtime.rayTracer.hit_wall()
        return {
            hit: hitWall,
            hitWall,
            x: runtime.rayTracer.x(),
            y: runtime.rayTracer.y(),
            distance: runtime.rayTracer.distance(),
        }
    },

    getHitscanRange(weaponId) {
        const range = runtime.weaponKernel.hitscan_range(weaponId)
        return range > 0 ? range : PhysicsConstants.MACHINE_RANGE
    },

    computeProjectileSpawn(weaponId, originX, originY, aimAngle) {
        const ok = runtime.weaponKernel.compute_projectile_spawn(
            weaponId,
            originX,
            originY,
            aimAngle,
        )
        if (!ok) return null
        const out = runtime.projectileSpawnOut
        out.kind = runtime.weaponKernel.spawn_kind()
        out.x = runtime.weaponKernel.spawn_x()
        out.y = runtime.weaponKernel.spawn_y()
        out.velocityX = runtime.weaponKernel.spawn_velocity_x()
        out.velocityY = runtime.weaponKernel.spawn_velocity_y()
        return out
    },

    getExplosionBaseDamage(projectileKind) {
        return runtime.module.get_explosion_base_damage(projectileKind)
    },

    applyExplosionKnockback(player, explosionX, explosionY, projectileKind, ownerId, pushScale = 1) {
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
            entry.mirror.dead = player.dead
        }

        const owner = toWasmPlayerId(ownerId)
        const falloff = runtime.module.wasm_apply_knockback_scaled(
            entry.state,
            explosionX,
            explosionY,
            projectileKind,
            owner,
            pushScale,
        )
        entry.state.export_to_host(runtime.scratchOutput)
        applyOutput(player, entry.mirror, runtime.scratchOutput)
        return falloff
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
        // dead is host-owned; sync mirror immediately to avoid stale divergence
        entry.mirror.dead = player.dead
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
