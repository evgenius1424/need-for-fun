use wasm_bindgen::prelude::*;

use crate::constants;
use crate::explosion::apply_knockback;
use crate::projectile::{calculate_bounds, step_projectile, Projectile, ProjectileKind};
use crate::step::step_player;
use crate::tilemap::FlatTileMap;
use crate::types::{PlayerInput, PlayerState};

const HOST_EXPORT_LEN: usize = 12;

#[wasm_bindgen]
pub struct WasmMap {
    inner: FlatTileMap,
}

#[wasm_bindgen]
impl WasmMap {
    #[wasm_bindgen(constructor)]
    pub fn new(rows: i32, cols: i32) -> Self {
        let len = (rows.max(0) as usize) * (cols.max(0) as usize);
        Self {
            inner: FlatTileMap::new(rows, cols, vec![0_u8; len]),
        }
    }

    pub fn upload_bricks(&mut self, bricks: &[u8]) {
        if bricks.len() == self.inner.bricks().len() {
            self.inner.bricks_mut().copy_from_slice(bricks);
        }
    }
}

#[wasm_bindgen]
pub struct WasmPlayerState {
    inner: PlayerState,
}

#[wasm_bindgen]
impl WasmPlayerState {
    #[wasm_bindgen(constructor)]
    pub fn new(id: u64) -> Self {
        Self {
            inner: PlayerState::new(id),
        }
    }

    pub fn import_host_state(
        &mut self,
        x: f32,
        y: f32,
        prev_x: f32,
        prev_y: f32,
        velocity_x: f32,
        velocity_y: f32,
        crouch: bool,
        doublejump_countdown: i32,
        speed_jump: i32,
        dead: bool,
        map: &WasmMap,
    ) {
        let moved =
            (self.inner.x - x).abs() > f32::EPSILON || (self.inner.y - y).abs() > f32::EPSILON;
        self.inner.x = x;
        self.inner.y = y;
        self.inner.prev_x = prev_x;
        self.inner.prev_y = prev_y;
        self.inner.velocity_x = velocity_x;
        self.inner.velocity_y = velocity_y;
        self.inner.crouch = crouch;
        self.inner.doublejump_countdown = doublejump_countdown;
        self.inner.speed_jump = speed_jump;
        self.inner.dead = dead;
        if moved {
            self.inner.recompute_caches(&map.inner);
        }
    }

    pub fn export_to_host(&self, out: &mut [f32]) {
        if out.len() < HOST_EXPORT_LEN {
            return;
        }
        out[0] = self.inner.x;
        out[1] = self.inner.y;
        out[2] = self.inner.prev_x;
        out[3] = self.inner.prev_y;
        out[4] = self.inner.velocity_x;
        out[5] = self.inner.velocity_y;
        out[6] = if self.inner.crouch { 1.0 } else { 0.0 };
        out[7] = self.inner.doublejump_countdown as f32;
        out[8] = self.inner.speed_jump as f32;
        out[9] = if self.inner.cache_on_ground { 1.0 } else { 0.0 };
        out[10] = if self.inner.cache_brick_on_head {
            1.0
        } else {
            0.0
        };
        out[11] = if self.inner.cache_brick_crouch_on_head {
            1.0
        } else {
            0.0
        };
    }
}

#[wasm_bindgen]
#[derive(Default)]
pub struct WasmPlayerInput {
    inner: PlayerInput,
}

#[wasm_bindgen]
impl WasmPlayerInput {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, key_up: bool, key_down: bool, key_left: bool, key_right: bool) {
        self.inner.key_up = key_up;
        self.inner.key_down = key_down;
        self.inner.key_left = key_left;
        self.inner.key_right = key_right;
    }
}

#[wasm_bindgen]
pub struct WasmPhysicsKernel;

#[wasm_bindgen]
impl WasmPhysicsKernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self
    }

    pub fn step_player(&self, state: &mut WasmPlayerState, input: &WasmPlayerInput, map: &WasmMap) {
        step_player(&mut state.inner, input.inner, &map.inner);
    }
}


#[wasm_bindgen]
pub struct WasmProjectile {
    inner: Projectile,
    exploded: bool,
    explosion_x: f32,
    explosion_y: f32,
}

#[wasm_bindgen]
impl WasmProjectile {
    #[wasm_bindgen(constructor)]
    pub fn new(id: u64, kind: u8, x: f32, y: f32, velocity_x: f32, velocity_y: f32, owner_id: u64) -> Self {
        let proj_kind = ProjectileKind::from_u8(kind).unwrap_or(ProjectileKind::Rocket);
        Self {
            inner: Projectile::new(id, proj_kind, x, y, velocity_x, velocity_y, owner_id),
            exploded: false,
            explosion_x: 0.0,
            explosion_y: 0.0,
        }
    }

    /// Step the projectile forward one tick.
    /// Returns true if the projectile exploded this tick.
    pub fn step(&mut self, map: &WasmMap, cols: i32, rows: i32) -> bool {
        // Reset explosion state each tick - did_explode() only returns true for ONE tick
        self.exploded = false;

        let bounds = calculate_bounds(cols, rows);
        if let Some(explosion) = step_projectile(&mut self.inner, &map.inner, bounds) {
            self.exploded = true;
            self.explosion_x = explosion.x;
            self.explosion_y = explosion.y;
            true
        } else {
            false
        }
    }

    /// Import state from host (for sync with server).
    pub fn import_host_state(
        &mut self,
        x: f32,
        y: f32,
        velocity_x: f32,
        velocity_y: f32,
        age: i32,
        active: bool,
    ) {
        self.inner.prev_x = self.inner.x;
        self.inner.prev_y = self.inner.y;
        self.inner.x = x;
        self.inner.y = y;
        self.inner.velocity_x = velocity_x;
        self.inner.velocity_y = velocity_y;
        self.inner.age = age;
        self.inner.active = active;
        // Reset explosion state on server sync
        self.exploded = false;
    }

    /// Export state to host array for bulk reads (render data only).
    /// Format: [kind, x, y, prev_x, prev_y, vx, vy, age, active, exploded, exp_x, exp_y]
    ///
    /// IDs are NOT included - use get_id() and get_owner_id() for correct u64/BigInt values.
    /// This avoids f32 precision loss for IDs > 2^24.
    pub fn export_to_host(&self, out: &mut [f32]) {
        if out.len() < 12 {
            return;
        }
        out[0] = self.inner.kind.as_u8() as f32;
        out[1] = self.inner.x;
        out[2] = self.inner.y;
        out[3] = self.inner.prev_x;
        out[4] = self.inner.prev_y;
        out[5] = self.inner.velocity_x;
        out[6] = self.inner.velocity_y;
        out[7] = self.inner.age as f32;
        out[8] = if self.inner.active { 1.0 } else { 0.0 };
        out[9] = if self.exploded { 1.0 } else { 0.0 };
        out[10] = self.explosion_x;
        out[11] = self.explosion_y;
    }

    pub fn is_active(&self) -> bool {
        self.inner.active
    }

    pub fn did_explode(&self) -> bool {
        self.exploded
    }

    pub fn get_x(&self) -> f32 {
        self.inner.x
    }

    pub fn get_y(&self) -> f32 {
        self.inner.y
    }

    pub fn get_prev_x(&self) -> f32 {
        self.inner.prev_x
    }

    pub fn get_prev_y(&self) -> f32 {
        self.inner.prev_y
    }

    pub fn get_velocity_x(&self) -> f32 {
        self.inner.velocity_x
    }

    pub fn get_velocity_y(&self) -> f32 {
        self.inner.velocity_y
    }

    pub fn get_explosion_x(&self) -> f32 {
        self.explosion_x
    }

    pub fn get_explosion_y(&self) -> f32 {
        self.explosion_y
    }

    pub fn get_id(&self) -> u64 {
        self.inner.id
    }

    pub fn get_kind(&self) -> u8 {
        self.inner.kind.as_u8()
    }

    pub fn get_owner_id(&self) -> u64 {
        self.inner.owner_id
    }

    pub fn get_age(&self) -> i32 {
        self.inner.age
    }
}

/// Apply explosion knockback to a player state.
/// Returns the damage falloff (0.0-1.0) if player was in radius, -1.0 otherwise.
#[wasm_bindgen]
pub fn wasm_apply_knockback(
    player: &mut WasmPlayerState,
    explosion_x: f32,
    explosion_y: f32,
    explosion_kind: u8,
    owner_id: u64,
) -> f32 {
    let kind = ProjectileKind::from_u8(explosion_kind).unwrap_or(ProjectileKind::Rocket);
    let explosion = crate::projectile::Explosion {
        x: explosion_x,
        y: explosion_y,
        kind,
        owner_id,
    };
    apply_knockback(&mut player.inner, &explosion).unwrap_or(-1.0)
}

// Constants getters for JS
#[wasm_bindgen]
pub fn get_projectile_gravity() -> f32 {
    constants::PROJECTILE_GRAVITY
}

#[wasm_bindgen]
pub fn get_grenade_fuse() -> i32 {
    constants::GRENADE_FUSE
}

#[wasm_bindgen]
pub fn get_grenade_min_velocity() -> f32 {
    constants::GRENADE_MIN_VELOCITY
}

#[wasm_bindgen]
pub fn get_grenade_air_friction() -> f32 {
    constants::GRENADE_AIR_FRICTION
}

#[wasm_bindgen]
pub fn get_grenade_bounce_friction() -> f32 {
    constants::GRENADE_BOUNCE_FRICTION
}

#[wasm_bindgen]
pub fn get_grenade_rise_damping() -> f32 {
    constants::GRENADE_RISE_DAMPING
}

#[wasm_bindgen]
pub fn get_grenade_max_fall_speed() -> f32 {
    constants::GRENADE_MAX_FALL_SPEED
}

#[wasm_bindgen]
pub fn get_bounds_margin() -> f32 {
    constants::BOUNDS_MARGIN
}

#[wasm_bindgen]
pub fn get_self_hit_grace() -> i32 {
    constants::SELF_HIT_GRACE
}

#[wasm_bindgen]
pub fn get_grenade_hit_grace() -> i32 {
    constants::GRENADE_HIT_GRACE
}

#[wasm_bindgen]
pub fn get_explosion_radius() -> f32 {
    constants::EXPLOSION_RADIUS
}

#[wasm_bindgen]
pub fn get_plasma_splash_damage() -> f32 {
    constants::PLASMA_SPLASH_DMG
}

#[wasm_bindgen]
#[inline(never)]
pub fn get_plasma_splash_radius() -> f32 {
    constants::PLASMA_SPLASH_RADIUS
}

#[wasm_bindgen]
pub fn get_plasma_splash_push() -> f32 {
    constants::PLASMA_SPLASH_PUSH
}

#[wasm_bindgen]
pub fn get_grenade_loft() -> f32 {
    constants::GRENADE_LOFT
}

#[wasm_bindgen]
pub fn get_shotgun_pellets() -> u32 {
    constants::SHOTGUN_PELLETS as u32
}

#[wasm_bindgen]
pub fn get_shotgun_spread() -> f32 {
    constants::SHOTGUN_SPREAD
}

#[wasm_bindgen]
pub fn get_shotgun_range() -> f32 {
    constants::SHOTGUN_RANGE
}

#[wasm_bindgen]
pub fn get_gauntlet_range() -> f32 {
    constants::GAUNTLET_RANGE
}

#[wasm_bindgen]
pub fn get_shaft_range() -> f32 {
    constants::SHAFT_RANGE
}

#[wasm_bindgen]
pub fn get_machine_range() -> f32 {
    constants::MACHINE_RANGE
}

#[wasm_bindgen]
pub fn get_rail_range() -> f32 {
    constants::RAIL_RANGE
}

#[wasm_bindgen]
#[inline(never)]
pub fn get_hit_radius_rocket() -> f32 {
    constants::HIT_RADIUS_ROCKET
}

#[wasm_bindgen]
pub fn get_hit_radius_bfg() -> f32 {
    constants::HIT_RADIUS_BFG
}

#[wasm_bindgen]
pub fn get_hit_radius_grenade() -> f32 {
    constants::HIT_RADIUS_GRENADE
}

#[wasm_bindgen]
pub fn get_hit_radius_plasma() -> f32 {
    constants::HIT_RADIUS_PLASMA
}

#[wasm_bindgen]
pub fn get_damage(weapon_id: u8) -> f32 {
    constants::DAMAGE.get(weapon_id as usize).copied().unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn get_default_ammo(weapon_id: u8) -> i32 {
    constants::DEFAULT_AMMO.get(weapon_id as usize).copied().unwrap_or(0)
}

#[wasm_bindgen]
pub fn get_pickup_ammo(weapon_id: u8) -> i32 {
    constants::PICKUP_AMMO.get(weapon_id as usize).copied().unwrap_or(0)
}

#[wasm_bindgen]
pub fn get_weapon_push(weapon_id: u8) -> f32 {
    constants::WEAPON_PUSH.get(weapon_id as usize).copied().unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn get_splash_radius(weapon_id: u8) -> f32 {
    constants::SPLASH_RADIUS.get(weapon_id as usize).copied().unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn get_projectile_speed(weapon_id: u8) -> f32 {
    constants::PROJECTILE_SPEED.get(weapon_id as usize).copied().unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn get_fire_rate(weapon_id: u8) -> i32 {
    constants::FIRE_RATE.get(weapon_id as usize).copied().unwrap_or(50)
}

// Tile size constants - JS should assert these match BRICK_WIDTH/BRICK_HEIGHT
#[wasm_bindgen]
pub fn get_tile_w() -> f32 {
    constants::TILE_W
}

#[wasm_bindgen]
#[inline(never)]
pub fn get_tile_h() -> f32 {
    constants::TILE_H
}

#[wasm_bindgen]
#[inline(never)]
pub fn get_max_health() -> i32 {
    constants::MAX_HEALTH
}

#[wasm_bindgen]
pub fn get_max_armor() -> i32 {
    constants::MAX_ARMOR
}

#[wasm_bindgen]
#[inline(never)]
pub fn get_mega_health() -> i32 {
    constants::MEGA_HEALTH
}

#[wasm_bindgen]
pub fn get_armor_absorption() -> f32 {
    constants::ARMOR_ABSORPTION
}

#[wasm_bindgen]
#[inline(never)]
pub fn get_self_damage_reduction() -> f32 {
    constants::SELF_DAMAGE_REDUCTION
}

#[wasm_bindgen]
pub fn get_quad_multiplier() -> f32 {
    constants::QUAD_MULTIPLIER
}

#[wasm_bindgen]
pub fn get_quad_duration() -> i32 {
    constants::QUAD_DURATION
}

#[wasm_bindgen]
pub fn get_respawn_time() -> i32 {
    constants::RESPAWN_TIME
}

#[wasm_bindgen]
pub fn get_spawn_protection() -> i32 {
    constants::SPAWN_PROTECTION
}
