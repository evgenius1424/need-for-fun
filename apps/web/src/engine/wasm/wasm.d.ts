/* tslint:disable */
/* eslint-disable */

export class WasmMap {
    free(): void;
    [Symbol.dispose](): void;
    constructor(rows: number, cols: number);
    upload_bricks(bricks: Uint8Array): void;
}

export class WasmPhysicsKernel {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    step_player(state: WasmPlayerState, input: WasmPlayerInput, map: WasmMap): void;
}

export class WasmPlayerInput {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    set(key_up: boolean, key_down: boolean, key_left: boolean, key_right: boolean): void;
}

export class WasmPlayerState {
    free(): void;
    [Symbol.dispose](): void;
    export_to_host(out: Float32Array): void;
    import_host_state(x: number, y: number, prev_x: number, prev_y: number, velocity_x: number, velocity_y: number, crouch: boolean, doublejump_countdown: number, speed_jump: number, dead: boolean, map: WasmMap): void;
    constructor(id: bigint);
}

export class WasmProjectile {
    free(): void;
    [Symbol.dispose](): void;
    did_explode(): boolean;
    /**
     * Export state to host array for bulk reads (render data only).
     * Format: [kind, x, y, prev_x, prev_y, vx, vy, age, active, exploded, exp_x, exp_y]
     *
     * IDs are NOT included - use get_id() and get_owner_id() for correct u64/BigInt values.
     * This avoids f32 precision loss for IDs > 2^24.
     */
    export_to_host(out: Float32Array): void;
    get_age(): number;
    get_explosion_x(): number;
    get_explosion_y(): number;
    get_id(): bigint;
    get_kind(): number;
    get_owner_id(): bigint;
    get_prev_x(): number;
    get_prev_y(): number;
    get_velocity_x(): number;
    get_velocity_y(): number;
    get_x(): number;
    get_y(): number;
    /**
     * Import state from host (for sync with server).
     */
    import_host_state(x: number, y: number, velocity_x: number, velocity_y: number, age: number, active: boolean): void;
    is_active(): boolean;
    constructor(id: bigint, kind: number, x: number, y: number, velocity_x: number, velocity_y: number, owner_id: bigint);
    /**
     * Step the projectile forward one tick.
     * Returns true if the projectile exploded this tick.
     */
    step(map: WasmMap, cols: number, rows: number): boolean;
}

export class WasmRayTracer {
    free(): void;
    [Symbol.dispose](): void;
    distance(): number;
    hit_wall(): boolean;
    constructor();
    trace(map: WasmMap, start_x: number, start_y: number, angle: number, max_distance: number): void;
    x(): number;
    y(): number;
}

export class WasmWeaponKernel {
    free(): void;
    [Symbol.dispose](): void;
    compute_projectile_spawn(weapon_id: number, origin_x: number, origin_y: number, aim_angle: number): boolean;
    hitscan_range(weapon_id: number): number;
    constructor();
    spawn_kind(): number;
    spawn_velocity_x(): number;
    spawn_velocity_y(): number;
    spawn_x(): number;
    spawn_y(): number;
}

export function get_armor_absorption(): number;

export function get_bounds_margin(): number;

export function get_damage(weapon_id: number): number;

export function get_default_ammo(weapon_id: number): number;

export function get_explosion_base_damage(explosion_kind: number): number;

export function get_explosion_radius(): number;

export function get_fire_rate(weapon_id: number): number;

export function get_gauntlet_player_radius(): number;

export function get_gauntlet_range(): number;

export function get_grenade_air_friction(): number;

export function get_grenade_bounce_friction(): number;

export function get_grenade_fuse(): number;

export function get_grenade_hit_grace(): number;

export function get_grenade_loft(): number;

export function get_grenade_max_fall_speed(): number;

export function get_grenade_min_velocity(): number;

export function get_grenade_rise_damping(): number;

export function get_hit_radius_bfg(): number;

export function get_hit_radius_grenade(): number;

export function get_hit_radius_plasma(): number;

export function get_hit_radius_rocket(): number;

export function get_hitscan_player_radius(): number;

export function get_machine_range(): number;

export function get_max_armor(): number;

export function get_max_health(): number;

export function get_mega_health(): number;

export function get_pickup_ammo(weapon_id: number): number;

export function get_pickup_radius(): number;

export function get_plasma_splash_damage(): number;

export function get_plasma_splash_push(): number;

export function get_plasma_splash_radius(): number;

export function get_player_half_h(): number;

export function get_projectile_gravity(): number;

export function get_projectile_offset(weapon_id: number): number;

export function get_projectile_speed(weapon_id: number): number;

export function get_quad_duration(): number;

export function get_quad_multiplier(): number;

export function get_rail_range(): number;

export function get_respawn_time(): number;

export function get_self_damage_reduction(): number;

export function get_self_hit_grace(): number;

export function get_shaft_range(): number;

export function get_shotgun_pellets(): number;

export function get_shotgun_range(): number;

export function get_shotgun_spread(): number;

export function get_spawn_offset_x(): number;

export function get_spawn_protection(): number;

export function get_splash_radius(weapon_id: number): number;

export function get_tile_h(): number;

export function get_tile_w(): number;

export function get_weapon_count(): number;

export function get_weapon_origin_crouch_lift(): number;

export function get_weapon_push(weapon_id: number): number;

/**
 * Apply explosion knockback to a player state.
 * Returns the damage falloff (0.0-1.0) if player was in radius, -1.0 otherwise.
 */
export function wasm_apply_knockback(player: WasmPlayerState, explosion_x: number, explosion_y: number, explosion_kind: number, owner_id: bigint): number;

export function wasm_apply_knockback_scaled(player: WasmPlayerState, explosion_x: number, explosion_y: number, explosion_kind: number, owner_id: bigint, push_scale: number): number;

export function wasm_decode_server_message(buffer: Uint8Array): any;

export function wasm_encode_hello(username: string): Uint8Array;

export function wasm_encode_input(seq: bigint, aim_angle: number, key_up: boolean, key_down: boolean, key_left: boolean, key_right: boolean, mouse_down: boolean, facing_left: boolean, weapon_switch: number, weapon_scroll: number): Uint8Array;

export function wasm_encode_join_room(room_id: string, map: string): Uint8Array;

export function wasm_encode_ping(client_time_ms: bigint): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmap_free: (a: number, b: number) => void;
    readonly __wbg_wasmphysicskernel_free: (a: number, b: number) => void;
    readonly __wbg_wasmplayerinput_free: (a: number, b: number) => void;
    readonly __wbg_wasmplayerstate_free: (a: number, b: number) => void;
    readonly __wbg_wasmprojectile_free: (a: number, b: number) => void;
    readonly __wbg_wasmraytracer_free: (a: number, b: number) => void;
    readonly __wbg_wasmweaponkernel_free: (a: number, b: number) => void;
    readonly get_armor_absorption: () => number;
    readonly get_bounds_margin: () => number;
    readonly get_damage: (a: number) => number;
    readonly get_default_ammo: (a: number) => number;
    readonly get_explosion_base_damage: (a: number) => number;
    readonly get_explosion_radius: () => number;
    readonly get_fire_rate: (a: number) => number;
    readonly get_gauntlet_player_radius: () => number;
    readonly get_gauntlet_range: () => number;
    readonly get_grenade_air_friction: () => number;
    readonly get_grenade_bounce_friction: () => number;
    readonly get_grenade_fuse: () => number;
    readonly get_grenade_hit_grace: () => number;
    readonly get_grenade_loft: () => number;
    readonly get_grenade_max_fall_speed: () => number;
    readonly get_grenade_min_velocity: () => number;
    readonly get_grenade_rise_damping: () => number;
    readonly get_hit_radius_bfg: () => number;
    readonly get_hit_radius_grenade: () => number;
    readonly get_hit_radius_plasma: () => number;
    readonly get_hitscan_player_radius: () => number;
    readonly get_machine_range: () => number;
    readonly get_max_armor: () => number;
    readonly get_pickup_ammo: (a: number) => number;
    readonly get_plasma_splash_damage: () => number;
    readonly get_plasma_splash_push: () => number;
    readonly get_player_half_h: () => number;
    readonly get_projectile_gravity: () => number;
    readonly get_projectile_offset: (a: number) => number;
    readonly get_projectile_speed: (a: number) => number;
    readonly get_quad_duration: () => number;
    readonly get_quad_multiplier: () => number;
    readonly get_rail_range: () => number;
    readonly get_respawn_time: () => number;
    readonly get_self_hit_grace: () => number;
    readonly get_shaft_range: () => number;
    readonly get_shotgun_pellets: () => number;
    readonly get_shotgun_range: () => number;
    readonly get_shotgun_spread: () => number;
    readonly get_spawn_protection: () => number;
    readonly get_splash_radius: (a: number) => number;
    readonly get_tile_w: () => number;
    readonly get_weapon_count: () => number;
    readonly get_weapon_origin_crouch_lift: () => number;
    readonly get_weapon_push: (a: number) => number;
    readonly wasm_apply_knockback: (a: number, b: number, c: number, d: number, e: bigint) => number;
    readonly wasm_apply_knockback_scaled: (a: number, b: number, c: number, d: number, e: bigint, f: number) => number;
    readonly wasmmap_new: (a: number, b: number) => number;
    readonly wasmmap_upload_bricks: (a: number, b: number, c: number) => void;
    readonly wasmphysicskernel_step_player: (a: number, b: number, c: number, d: number) => void;
    readonly wasmplayerinput_new: () => number;
    readonly wasmplayerinput_set: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmplayerstate_export_to_host: (a: number, b: number, c: number, d: any) => void;
    readonly wasmplayerstate_import_host_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly wasmplayerstate_new: (a: bigint) => number;
    readonly wasmprojectile_did_explode: (a: number) => number;
    readonly wasmprojectile_export_to_host: (a: number, b: number, c: number, d: any) => void;
    readonly wasmprojectile_get_age: (a: number) => number;
    readonly wasmprojectile_get_explosion_x: (a: number) => number;
    readonly wasmprojectile_get_explosion_y: (a: number) => number;
    readonly wasmprojectile_get_id: (a: number) => bigint;
    readonly wasmprojectile_get_kind: (a: number) => number;
    readonly wasmprojectile_get_owner_id: (a: number) => bigint;
    readonly wasmprojectile_get_prev_x: (a: number) => number;
    readonly wasmprojectile_get_prev_y: (a: number) => number;
    readonly wasmprojectile_get_velocity_x: (a: number) => number;
    readonly wasmprojectile_get_velocity_y: (a: number) => number;
    readonly wasmprojectile_get_x: (a: number) => number;
    readonly wasmprojectile_get_y: (a: number) => number;
    readonly wasmprojectile_import_host_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly wasmprojectile_is_active: (a: number) => number;
    readonly wasmprojectile_new: (a: bigint, b: number, c: number, d: number, e: number, f: number, g: bigint) => number;
    readonly wasmprojectile_step: (a: number, b: number, c: number, d: number) => number;
    readonly wasmraytracer_distance: (a: number) => number;
    readonly wasmraytracer_hit_wall: (a: number) => number;
    readonly wasmraytracer_new: () => number;
    readonly wasmraytracer_trace: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly wasmraytracer_x: (a: number) => number;
    readonly wasmraytracer_y: (a: number) => number;
    readonly wasmweaponkernel_compute_projectile_spawn: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly wasmweaponkernel_hitscan_range: (a: number, b: number) => number;
    readonly wasmweaponkernel_new: () => number;
    readonly wasmweaponkernel_spawn_kind: (a: number) => number;
    readonly wasmweaponkernel_spawn_velocity_y: (a: number) => number;
    readonly get_hit_radius_rocket: () => number;
    readonly get_max_health: () => number;
    readonly get_mega_health: () => number;
    readonly get_pickup_radius: () => number;
    readonly get_plasma_splash_radius: () => number;
    readonly get_self_damage_reduction: () => number;
    readonly get_spawn_offset_x: () => number;
    readonly get_tile_h: () => number;
    readonly wasmweaponkernel_spawn_velocity_x: (a: number) => number;
    readonly wasmweaponkernel_spawn_x: (a: number) => number;
    readonly wasmweaponkernel_spawn_y: (a: number) => number;
    readonly wasmphysicskernel_new: () => number;
    readonly wasm_decode_server_message: (a: number, b: number) => any;
    readonly wasm_encode_hello: (a: number, b: number) => [number, number];
    readonly wasm_encode_input: (a: bigint, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasm_encode_join_room: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasm_encode_ping: (a: bigint) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
