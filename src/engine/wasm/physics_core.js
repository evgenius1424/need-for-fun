/* @ts-self-types="./physics_core.d.ts" */

export class WasmMap {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMapFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmap_free(ptr, 0);
    }
    /**
     * @param {number} rows
     * @param {number} cols
     */
    constructor(rows, cols) {
        const ret = wasm.wasmmap_new(rows, cols);
        this.__wbg_ptr = ret >>> 0;
        WasmMapFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Uint8Array} bricks
     */
    upload_bricks(bricks) {
        const ptr0 = passArray8ToWasm0(bricks, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmmap_upload_bricks(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) WasmMap.prototype[Symbol.dispose] = WasmMap.prototype.free;

export class WasmPhysicsKernel {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPhysicsKernelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmphysicskernel_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmphysicskernel_new();
        this.__wbg_ptr = ret >>> 0;
        WasmPhysicsKernelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {WasmPlayerState} state
     * @param {WasmPlayerInput} input
     * @param {WasmMap} map
     */
    step_player(state, input, map) {
        _assertClass(state, WasmPlayerState);
        _assertClass(input, WasmPlayerInput);
        _assertClass(map, WasmMap);
        wasm.wasmphysicskernel_step_player(this.__wbg_ptr, state.__wbg_ptr, input.__wbg_ptr, map.__wbg_ptr);
    }
}
if (Symbol.dispose) WasmPhysicsKernel.prototype[Symbol.dispose] = WasmPhysicsKernel.prototype.free;

export class WasmPlayerInput {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPlayerInputFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmplayerinput_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmplayerinput_new();
        this.__wbg_ptr = ret >>> 0;
        WasmPlayerInputFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {boolean} key_up
     * @param {boolean} key_down
     * @param {boolean} key_left
     * @param {boolean} key_right
     */
    set(key_up, key_down, key_left, key_right) {
        wasm.wasmplayerinput_set(this.__wbg_ptr, key_up, key_down, key_left, key_right);
    }
}
if (Symbol.dispose) WasmPlayerInput.prototype[Symbol.dispose] = WasmPlayerInput.prototype.free;

export class WasmPlayerState {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPlayerStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmplayerstate_free(ptr, 0);
    }
    /**
     * @param {Float32Array} out
     */
    export_to_host(out) {
        var ptr0 = passArrayF32ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.wasmplayerstate_export_to_host(this.__wbg_ptr, ptr0, len0, out);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} prev_x
     * @param {number} prev_y
     * @param {number} velocity_x
     * @param {number} velocity_y
     * @param {boolean} crouch
     * @param {number} doublejump_countdown
     * @param {number} speed_jump
     * @param {boolean} dead
     * @param {WasmMap} map
     */
    import_host_state(x, y, prev_x, prev_y, velocity_x, velocity_y, crouch, doublejump_countdown, speed_jump, dead, map) {
        _assertClass(map, WasmMap);
        wasm.wasmplayerstate_import_host_state(this.__wbg_ptr, x, y, prev_x, prev_y, velocity_x, velocity_y, crouch, doublejump_countdown, speed_jump, dead, map.__wbg_ptr);
    }
    /**
     * @param {bigint} id
     */
    constructor(id) {
        const ret = wasm.wasmplayerstate_new(id);
        this.__wbg_ptr = ret >>> 0;
        WasmPlayerStateFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmPlayerState.prototype[Symbol.dispose] = WasmPlayerState.prototype.free;

export class WasmProjectile {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmProjectileFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmprojectile_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    did_explode() {
        const ret = wasm.wasmprojectile_did_explode(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Export state to host array for bulk reads (render data only).
     * Format: [kind, x, y, prev_x, prev_y, vx, vy, age, active, exploded, exp_x, exp_y]
     *
     * IDs are NOT included - use get_id() and get_owner_id() for correct u64/BigInt values.
     * This avoids f32 precision loss for IDs > 2^24.
     * @param {Float32Array} out
     */
    export_to_host(out) {
        var ptr0 = passArrayF32ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.wasmprojectile_export_to_host(this.__wbg_ptr, ptr0, len0, out);
    }
    /**
     * @returns {number}
     */
    get_age() {
        const ret = wasm.wasmprojectile_get_age(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_explosion_x() {
        const ret = wasm.wasmprojectile_get_explosion_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_explosion_y() {
        const ret = wasm.wasmprojectile_get_explosion_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {bigint}
     */
    get_id() {
        const ret = wasm.wasmprojectile_get_id(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    get_kind() {
        const ret = wasm.wasmprojectile_get_kind(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {bigint}
     */
    get_owner_id() {
        const ret = wasm.wasmprojectile_get_owner_id(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    get_prev_x() {
        const ret = wasm.wasmprojectile_get_prev_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_prev_y() {
        const ret = wasm.wasmprojectile_get_prev_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_velocity_x() {
        const ret = wasm.wasmprojectile_get_velocity_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_velocity_y() {
        const ret = wasm.wasmprojectile_get_velocity_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_x() {
        const ret = wasm.wasmprojectile_get_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_y() {
        const ret = wasm.wasmprojectile_get_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * Import state from host (for sync with server).
     * @param {number} x
     * @param {number} y
     * @param {number} velocity_x
     * @param {number} velocity_y
     * @param {number} age
     * @param {boolean} active
     */
    import_host_state(x, y, velocity_x, velocity_y, age, active) {
        wasm.wasmprojectile_import_host_state(this.__wbg_ptr, x, y, velocity_x, velocity_y, age, active);
    }
    /**
     * @returns {boolean}
     */
    is_active() {
        const ret = wasm.wasmprojectile_is_active(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {bigint} id
     * @param {number} kind
     * @param {number} x
     * @param {number} y
     * @param {number} velocity_x
     * @param {number} velocity_y
     * @param {bigint} owner_id
     */
    constructor(id, kind, x, y, velocity_x, velocity_y, owner_id) {
        const ret = wasm.wasmprojectile_new(id, kind, x, y, velocity_x, velocity_y, owner_id);
        this.__wbg_ptr = ret >>> 0;
        WasmProjectileFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Step the projectile forward one tick.
     * Returns true if the projectile exploded this tick.
     * @param {WasmMap} map
     * @param {number} cols
     * @param {number} rows
     * @returns {boolean}
     */
    step(map, cols, rows) {
        _assertClass(map, WasmMap);
        const ret = wasm.wasmprojectile_step(this.__wbg_ptr, map.__wbg_ptr, cols, rows);
        return ret !== 0;
    }
}
if (Symbol.dispose) WasmProjectile.prototype[Symbol.dispose] = WasmProjectile.prototype.free;

export class WasmRayTracer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmRayTracerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmraytracer_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    distance() {
        const ret = wasm.wasmraytracer_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    hit_wall() {
        const ret = wasm.wasmraytracer_hit_wall(this.__wbg_ptr);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.wasmraytracer_new();
        this.__wbg_ptr = ret >>> 0;
        WasmRayTracerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {WasmMap} map
     * @param {number} start_x
     * @param {number} start_y
     * @param {number} angle
     * @param {number} max_distance
     */
    trace(map, start_x, start_y, angle, max_distance) {
        _assertClass(map, WasmMap);
        wasm.wasmraytracer_trace(this.__wbg_ptr, map.__wbg_ptr, start_x, start_y, angle, max_distance);
    }
    /**
     * @returns {number}
     */
    x() {
        const ret = wasm.wasmraytracer_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    y() {
        const ret = wasm.wasmraytracer_y(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmRayTracer.prototype[Symbol.dispose] = WasmRayTracer.prototype.free;

export class WasmWeaponKernel {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmWeaponKernelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmweaponkernel_free(ptr, 0);
    }
    /**
     * @param {number} weapon_id
     * @param {number} origin_x
     * @param {number} origin_y
     * @param {number} aim_angle
     * @returns {boolean}
     */
    compute_projectile_spawn(weapon_id, origin_x, origin_y, aim_angle) {
        const ret = wasm.wasmweaponkernel_compute_projectile_spawn(this.__wbg_ptr, weapon_id, origin_x, origin_y, aim_angle);
        return ret !== 0;
    }
    /**
     * @param {number} weapon_id
     * @returns {number}
     */
    hitscan_range(weapon_id) {
        const ret = wasm.wasmweaponkernel_hitscan_range(this.__wbg_ptr, weapon_id);
        return ret;
    }
    constructor() {
        const ret = wasm.wasmweaponkernel_new();
        this.__wbg_ptr = ret >>> 0;
        WasmWeaponKernelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    spawn_kind() {
        const ret = wasm.wasmweaponkernel_spawn_kind(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    spawn_velocity_x() {
        const ret = wasm.wasmraytracer_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    spawn_velocity_y() {
        const ret = wasm.wasmweaponkernel_spawn_velocity_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    spawn_x() {
        const ret = wasm.wasmraytracer_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    spawn_y() {
        const ret = wasm.wasmraytracer_y(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmWeaponKernel.prototype[Symbol.dispose] = WasmWeaponKernel.prototype.free;

/**
 * @returns {number}
 */
export function get_armor_absorption() {
    const ret = wasm.get_armor_absorption();
    return ret;
}

/**
 * @returns {number}
 */
export function get_bounds_margin() {
    const ret = wasm.get_bounds_margin();
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_damage(weapon_id) {
    const ret = wasm.get_damage(weapon_id);
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_default_ammo(weapon_id) {
    const ret = wasm.get_default_ammo(weapon_id);
    return ret;
}

/**
 * @returns {number}
 */
export function get_explosion_radius() {
    const ret = wasm.get_explosion_radius();
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_fire_rate(weapon_id) {
    const ret = wasm.get_fire_rate(weapon_id);
    return ret;
}

/**
 * @returns {number}
 */
export function get_gauntlet_player_radius() {
    const ret = wasm.get_gauntlet_player_radius();
    return ret;
}

/**
 * @returns {number}
 */
export function get_gauntlet_range() {
    const ret = wasm.get_gauntlet_range();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_air_friction() {
    const ret = wasm.get_grenade_air_friction();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_bounce_friction() {
    const ret = wasm.get_grenade_bounce_friction();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_fuse() {
    const ret = wasm.get_grenade_fuse();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_hit_grace() {
    const ret = wasm.get_grenade_hit_grace();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_loft() {
    const ret = wasm.get_grenade_loft();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_max_fall_speed() {
    const ret = wasm.get_grenade_max_fall_speed();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_min_velocity() {
    const ret = wasm.get_grenade_min_velocity();
    return ret;
}

/**
 * @returns {number}
 */
export function get_grenade_rise_damping() {
    const ret = wasm.get_grenade_rise_damping();
    return ret;
}

/**
 * @returns {number}
 */
export function get_hit_radius_bfg() {
    const ret = wasm.get_hit_radius_bfg();
    return ret;
}

/**
 * @returns {number}
 */
export function get_hit_radius_grenade() {
    const ret = wasm.get_hit_radius_grenade();
    return ret;
}

/**
 * @returns {number}
 */
export function get_hit_radius_plasma() {
    const ret = wasm.get_hit_radius_plasma();
    return ret;
}

/**
 * @returns {number}
 */
export function get_hit_radius_rocket() {
    const ret = wasm.get_hit_radius_rocket();
    return ret;
}

/**
 * @returns {number}
 */
export function get_hitscan_player_radius() {
    const ret = wasm.get_hitscan_player_radius();
    return ret;
}

/**
 * @returns {number}
 */
export function get_machine_range() {
    const ret = wasm.get_machine_range();
    return ret;
}

/**
 * @returns {number}
 */
export function get_max_armor() {
    const ret = wasm.get_max_armor();
    return ret;
}

/**
 * @returns {number}
 */
export function get_max_health() {
    const ret = wasm.get_max_health();
    return ret;
}

/**
 * @returns {number}
 */
export function get_mega_health() {
    const ret = wasm.get_mega_health();
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_pickup_ammo(weapon_id) {
    const ret = wasm.get_pickup_ammo(weapon_id);
    return ret;
}

/**
 * @returns {number}
 */
export function get_pickup_radius() {
    const ret = wasm.get_hit_radius_grenade();
    return ret;
}

/**
 * @returns {number}
 */
export function get_plasma_splash_damage() {
    const ret = wasm.get_plasma_splash_damage();
    return ret;
}

/**
 * @returns {number}
 */
export function get_plasma_splash_push() {
    const ret = wasm.get_plasma_splash_push();
    return ret;
}

/**
 * @returns {number}
 */
export function get_plasma_splash_radius() {
    const ret = wasm.get_plasma_splash_radius();
    return ret;
}

/**
 * @returns {number}
 */
export function get_player_half_h() {
    const ret = wasm.get_player_half_h();
    return ret;
}

/**
 * @returns {number}
 */
export function get_projectile_gravity() {
    const ret = wasm.get_projectile_gravity();
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_projectile_offset(weapon_id) {
    const ret = wasm.get_projectile_offset(weapon_id);
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_projectile_speed(weapon_id) {
    const ret = wasm.get_projectile_speed(weapon_id);
    return ret;
}

/**
 * @returns {number}
 */
export function get_quad_duration() {
    const ret = wasm.get_quad_duration();
    return ret;
}

/**
 * @returns {number}
 */
export function get_quad_multiplier() {
    const ret = wasm.get_quad_multiplier();
    return ret;
}

/**
 * @returns {number}
 */
export function get_rail_range() {
    const ret = wasm.get_rail_range();
    return ret;
}

/**
 * @returns {number}
 */
export function get_respawn_time() {
    const ret = wasm.get_respawn_time();
    return ret;
}

/**
 * @returns {number}
 */
export function get_self_damage_reduction() {
    const ret = wasm.get_self_damage_reduction();
    return ret;
}

/**
 * @returns {number}
 */
export function get_self_hit_grace() {
    const ret = wasm.get_self_hit_grace();
    return ret;
}

/**
 * @returns {number}
 */
export function get_shaft_range() {
    const ret = wasm.get_shaft_range();
    return ret;
}

/**
 * @returns {number}
 */
export function get_shotgun_pellets() {
    const ret = wasm.get_shotgun_pellets();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function get_shotgun_range() {
    const ret = wasm.get_shotgun_range();
    return ret;
}

/**
 * @returns {number}
 */
export function get_shotgun_spread() {
    const ret = wasm.get_shotgun_spread();
    return ret;
}

/**
 * @returns {number}
 */
export function get_spawn_offset_x() {
    const ret = wasm.get_plasma_splash_damage();
    return ret;
}

/**
 * @returns {number}
 */
export function get_spawn_protection() {
    const ret = wasm.get_spawn_protection();
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_splash_radius(weapon_id) {
    const ret = wasm.get_splash_radius(weapon_id);
    return ret;
}

/**
 * @returns {number}
 */
export function get_tile_h() {
    const ret = wasm.get_tile_h();
    return ret;
}

/**
 * @returns {number}
 */
export function get_tile_w() {
    const ret = wasm.get_tile_w();
    return ret;
}

/**
 * @returns {number}
 */
export function get_weapon_count() {
    const ret = wasm.get_weapon_count();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function get_weapon_origin_crouch_lift() {
    const ret = wasm.get_weapon_origin_crouch_lift();
    return ret;
}

/**
 * @param {number} weapon_id
 * @returns {number}
 */
export function get_weapon_push(weapon_id) {
    const ret = wasm.get_weapon_push(weapon_id);
    return ret;
}

/**
 * Apply explosion knockback to a player state.
 * Returns the damage falloff (0.0-1.0) if player was in radius, -1.0 otherwise.
 * @param {WasmPlayerState} player
 * @param {number} explosion_x
 * @param {number} explosion_y
 * @param {number} explosion_kind
 * @param {bigint} owner_id
 * @returns {number}
 */
export function wasm_apply_knockback(player, explosion_x, explosion_y, explosion_kind, owner_id) {
    _assertClass(player, WasmPlayerState);
    const ret = wasm.wasm_apply_knockback(player.__wbg_ptr, explosion_x, explosion_y, explosion_kind, owner_id);
    return ret;
}

/**
 * @param {Uint8Array} buffer
 * @returns {any}
 */
export function wasm_decode_server_message(buffer) {
    const ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasm_decode_server_message(ptr0, len0);
    return ret;
}

/**
 * @param {string} username
 * @returns {Uint8Array}
 */
export function wasm_encode_hello(username) {
    const ptr0 = passStringToWasm0(username, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasm_encode_hello(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {bigint} seq
 * @param {number} aim_angle
 * @param {boolean} key_up
 * @param {boolean} key_down
 * @param {boolean} key_left
 * @param {boolean} key_right
 * @param {boolean} mouse_down
 * @param {boolean} facing_left
 * @param {number} weapon_switch
 * @param {number} weapon_scroll
 * @returns {Uint8Array}
 */
export function wasm_encode_input(seq, aim_angle, key_up, key_down, key_left, key_right, mouse_down, facing_left, weapon_switch, weapon_scroll) {
    const ret = wasm.wasm_encode_input(seq, aim_angle, key_up, key_down, key_left, key_right, mouse_down, facing_left, weapon_switch, weapon_scroll);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {string} room_id
 * @param {string} map
 * @returns {Uint8Array}
 */
export function wasm_encode_join_room(room_id, map) {
    const ptr0 = passStringToWasm0(room_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(map, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.wasm_encode_join_room(ptr0, len0, ptr1, len1);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_fc0809a4dec43528: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_is_null_ac34f5003991759a: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_new_361308b2356cecd0: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_3eb36ae241fe6f44: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_push_8ffdcb2063340ba5: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_set_6cb8631f80447a67: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./physics_core_bg.js": import0,
    };
}

const WasmMapFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmap_free(ptr >>> 0, 1));
const WasmPhysicsKernelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmphysicskernel_free(ptr >>> 0, 1));
const WasmPlayerInputFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmplayerinput_free(ptr >>> 0, 1));
const WasmPlayerStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmplayerstate_free(ptr >>> 0, 1));
const WasmProjectileFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmprojectile_free(ptr >>> 0, 1));
const WasmRayTracerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmraytracer_free(ptr >>> 0, 1));
const WasmWeaponKernelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmweaponkernel_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('physics_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
