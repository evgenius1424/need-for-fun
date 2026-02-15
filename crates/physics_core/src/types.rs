use crate::constants::{DEFAULT_AMMO, WEAPON_COUNT};
use crate::tilemap::TileMap;

#[derive(Clone, Copy, Default)]
pub struct PlayerInput {
    pub key_up: bool,
    pub key_down: bool,
    pub key_left: bool,
    pub key_right: bool,
}

#[derive(Clone)]
pub struct PlayerState {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub prev_x: f32,
    pub prev_y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub key_up: bool,
    pub key_down: bool,
    pub key_left: bool,
    pub key_right: bool,
    pub crouch: bool,
    pub doublejump_countdown: i32,
    pub speed_jump: i32,
    pub cache_on_ground: bool,
    pub cache_brick_on_head: bool,
    pub cache_brick_crouch_on_head: bool,
    pub last_cache_x: i32,
    pub last_cache_y: i32,
    pub health: i32,
    pub armor: i32,
    pub dead: bool,
    pub respawn_timer: i32,
    pub spawn_protection: i32,
    pub aim_angle: f32,
    pub facing_left: bool,
    pub current_weapon: i32,
    pub fire_cooldown: i32,
    pub weapons: [bool; WEAPON_COUNT],
    pub ammo: [i32; WEAPON_COUNT],
    pub quad_damage: bool,
    pub quad_timer: i32,
    pub last_key_up: bool,
    pub last_was_jump: bool,
    pub speed_jump_dir: i32,
}

impl PlayerState {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            prev_x: 0.0,
            prev_y: 0.0,
            velocity_x: 0.0,
            velocity_y: 0.0,
            key_up: false,
            key_down: false,
            key_left: false,
            key_right: false,
            crouch: false,
            doublejump_countdown: 0,
            speed_jump: 0,
            cache_on_ground: false,
            cache_brick_on_head: false,
            cache_brick_crouch_on_head: false,
            last_cache_x: i32::MIN,
            last_cache_y: i32::MIN,
            health: 100,
            armor: 0,
            dead: false,
            respawn_timer: 0,
            spawn_protection: 0,
            aim_angle: 0.0,
            facing_left: false,
            current_weapon: 4,
            fire_cooldown: 0,
            weapons: [true; WEAPON_COUNT],
            ammo: DEFAULT_AMMO,
            quad_damage: false,
            quad_timer: 0,
            last_key_up: false,
            last_was_jump: false,
            speed_jump_dir: 0,
        }
    }

    pub fn set_xy<M: TileMap + ?Sized>(&mut self, x: f32, y: f32, map: &M) {
        if (self.x - x).abs() > f32::EPSILON || (self.y - y).abs() > f32::EPSILON {
            self.x = x;
            self.y = y;
            self.update_caches(map);
        }
    }

    pub fn recompute_caches<M: TileMap + ?Sized>(&mut self, map: &M) {
        self.last_cache_x = i32::MIN;
        self.last_cache_y = i32::MIN;
        self.update_caches(map);
    }

    pub fn update(&mut self) {
        if self.fire_cooldown > 0 {
            self.fire_cooldown -= 1;
        }
        if self.spawn_protection > 0 {
            self.spawn_protection -= 1;
        }
        if self.dead && self.respawn_timer > 0 {
            self.respawn_timer -= 1;
        }
        if self.quad_damage {
            self.quad_timer -= 1;
            if self.quad_timer <= 0 {
                self.quad_damage = false;
            }
        }
    }

    fn update_caches<M: TileMap + ?Sized>(&mut self, map: &M) {
        let cache_x = trunc_i32(self.x);
        let cache_y = trunc_i32(self.y);
        if cache_x == self.last_cache_x && cache_y == self.last_cache_y {
            return;
        }
        self.last_cache_x = cache_x;
        self.last_cache_y = cache_y;

        let col_l =
            trunc_i32((self.x - crate::constants::PLAYER_HALF_W) / crate::constants::TILE_W);
        let col_r =
            trunc_i32((self.x + crate::constants::PLAYER_HALF_W) / crate::constants::TILE_W);
        let col_l_narrow =
            trunc_i32((self.x - crate::constants::PLAYER_CROUCH_HALF_W) / crate::constants::TILE_W);
        let col_r_narrow =
            trunc_i32((self.x + crate::constants::PLAYER_CROUCH_HALF_W) / crate::constants::TILE_W);

        self.cache_on_ground = crate::step::check_ground(map, col_l, col_r, self.y);
        self.cache_brick_on_head = crate::step::check_head(map, col_l, col_r, self.y);
        self.cache_brick_crouch_on_head =
            crate::step::check_crouch_head(map, col_l_narrow, col_r_narrow, self.y);
    }

    pub fn is_on_ground(&self) -> bool {
        self.cache_on_ground
    }

    pub fn is_brick_on_head(&self) -> bool {
        self.cache_brick_on_head
    }

    pub fn is_brick_crouch_on_head(&self) -> bool {
        self.cache_brick_crouch_on_head
    }
}

#[inline]
pub fn trunc_i32(value: f32) -> i32 {
    value.trunc() as i32
}

#[inline]
pub fn clamp(value: f32, min: f32, max: f32) -> f32 {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}
