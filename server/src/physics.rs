use crate::constants::{
    PLAYER_CROUCH_HALF_H, PLAYER_HALF_H, PLAYER_HALF_W, TILE_H, TILE_W, WEAPON_COUNT,
};
use crate::map::GameMap;

const PLAYER_MAX_VELOCITY_X: f32 = 3.0;

const GROUND_PROBE: f32 = 25.0;
const HEAD_PROBE: f32 = 25.0;
const CROUCH_HEAD_PROBE: f32 = 9.0;

const SPEED_JUMP_Y: [f32; 7] = [0.0, 0.0, 0.4, 0.8, 1.0, 1.2, 1.4];
const SPEED_JUMP_X: [f32; 7] = [0.0, 0.33, 0.8, 1.1, 1.4, 1.8, 2.2];

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
    cache_on_ground: bool,
    cache_brick_on_head: bool,
    cache_brick_crouch_on_head: bool,
    last_cache_x: i32,
    last_cache_y: i32,
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
    last_key_up: bool,
    last_was_jump: bool,
    speed_jump_dir: i32,
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
            ammo: [-1, 100, 10, 5, 20, 10, 30, 50, 10],
            quad_damage: false,
            quad_timer: 0,
            last_key_up: false,
            last_was_jump: false,
            speed_jump_dir: 0,
        }
    }

    pub fn set_xy(&mut self, x: f32, y: f32, map: &GameMap) {
        if (self.x - x).abs() > f32::EPSILON || (self.y - y).abs() > f32::EPSILON {
            self.x = x;
            self.y = y;
            self.update_caches(map);
        }
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

    fn update_caches(&mut self, map: &GameMap) {
        let cache_x = trunc_i32(self.x);
        let cache_y = trunc_i32(self.y);
        if cache_x == self.last_cache_x && cache_y == self.last_cache_y {
            return;
        }
        self.last_cache_x = cache_x;
        self.last_cache_y = cache_y;

        let col_l = trunc_i32((self.x - PLAYER_HALF_W) / TILE_W);
        let col_r = trunc_i32((self.x + PLAYER_HALF_W) / TILE_W);
        let col_l_narrow = trunc_i32((self.x - PLAYER_CROUCH_HALF_H) / TILE_W);
        let col_r_narrow = trunc_i32((self.x + PLAYER_CROUCH_HALF_H) / TILE_W);

        self.cache_on_ground = check_ground(map, col_l, col_r, self.y);
        self.cache_brick_on_head = check_head(map, col_l, col_r, self.y);
        self.cache_brick_crouch_on_head =
            check_crouch_head(map, col_l_narrow, col_r_narrow, self.y);
    }

    fn is_on_ground(&self) -> bool {
        self.cache_on_ground
    }

    fn is_brick_on_head(&self) -> bool {
        self.cache_brick_on_head
    }

    fn is_brick_crouch_on_head(&self) -> bool {
        self.cache_brick_crouch_on_head
    }
}

pub fn step_player(player: &mut PlayerState, map: &GameMap) {
    player.update();
    if player.dead {
        return;
    }
    apply_physics(player, map);
    if player.doublejump_countdown > 0 {
        player.doublejump_countdown -= 1;
    }
    if player.is_on_ground() {
        player.velocity_y = 0.0;
    }
    handle_jump(player);
    handle_crouch(player);
    handle_horizontal_movement(player);
}

fn apply_physics(player: &mut PlayerState, map: &GameMap) {
    let start_x = player.x;
    let start_y = player.y;

    player.velocity_y += 0.056;
    if player.velocity_y > -1.0 && player.velocity_y < 0.0 {
        player.velocity_y /= 1.11;
    }
    if player.velocity_y > 0.0 && player.velocity_y < 5.0 {
        player.velocity_y *= 1.1;
    }

    if player.velocity_x.abs() > 0.2 {
        if player.key_left == player.key_right {
            player.velocity_x /= if player.is_on_ground() { 1.14 } else { 1.025 };
        }
    } else {
        player.velocity_x = 0.0;
    }

    let speed_x = get_speed_x(player);
    let new_x = player.x + player.velocity_x + speed_x;
    let new_y = player.y + player.velocity_y;
    player.set_xy(new_x, new_y, map);

    if player.crouch {
        if player.is_on_ground() && (player.is_brick_crouch_on_head() || player.velocity_y > 0.0) {
            player.velocity_y = 0.0;
            let snap = trunc_i32(round(player.y) / TILE_H) as f32 * TILE_H + TILE_H / 2.0;
            player.set_xy(player.x, snap, map);
        } else if player.is_brick_crouch_on_head() && player.velocity_y < 0.0 {
            player.velocity_y = 0.0;
            player.doublejump_countdown = 3;
            let snap = trunc_i32(round(player.y) / TILE_H) as f32 * TILE_H + TILE_H / 2.0;
            player.set_xy(player.x, snap, map);
        }
    }

    if player.velocity_x != 0.0 {
        let col =
            trunc_i32(round(start_x + if player.velocity_x < 0.0 { -11.0 } else { 11.0 }) / TILE_W);
        let check_y = if player.crouch { player.y } else { start_y };
        let head_off = if player.crouch { 8.0 } else { 16.0 };

        if map.is_brick(col, trunc_i32(round(check_y - head_off) / TILE_H))
            || map.is_brick(col, trunc_i32(round(check_y) / TILE_H))
            || map.is_brick(col, trunc_i32(round(check_y + TILE_H) / TILE_H))
        {
            let snap = trunc_i32(start_x / TILE_W) as f32 * TILE_W
                + if player.velocity_x < 0.0 { 9.0 } else { 22.0 };
            player.set_xy(snap, player.y, map);
            player.velocity_x = 0.0;
            player.speed_jump = 0;
        }
    }

    if player.is_on_ground() && (player.is_brick_on_head() || player.velocity_y > 0.0) {
        player.velocity_y = 0.0;
        let snap = trunc_i32(round(player.y) / TILE_H) as f32 * TILE_H + TILE_H / 2.0;
        player.set_xy(player.x, snap, map);
    } else if player.is_brick_on_head() && player.velocity_y < 0.0 {
        player.velocity_y = 0.0;
        player.doublejump_countdown = 3;
    }

    player.velocity_x = clamp(player.velocity_x, -5.0, 5.0);
    player.velocity_y = clamp(player.velocity_y, -5.0, 5.0);
}

fn handle_jump(player: &mut PlayerState) {
    let keys_changed = player.key_up != player.last_key_up
        || (player.key_left && player.speed_jump_dir != -1)
        || (player.key_right && player.speed_jump_dir != 1);

    if player.speed_jump > 0 && keys_changed {
        player.speed_jump = 0;
    }

    player.last_key_up = player.key_up;
    let mut jumped = false;

    if player.key_up && player.is_on_ground() && !player.is_brick_on_head() && !player.last_was_jump
    {
        let is_double_jump = player.doublejump_countdown > 4 && player.doublejump_countdown < 11;
        if is_double_jump {
            player.doublejump_countdown = 14;
            player.velocity_y = -3.0;
            let total_speed_x = if player.velocity_x != 0.0 {
                player.velocity_x.abs() + SPEED_JUMP_X[player.speed_jump as usize]
            } else {
                0.0
            };
            if total_speed_x > 3.0 {
                let bonus = total_speed_x - 3.0;
                player.velocity_y -= bonus;
            }
            player.crouch = false;
        } else {
            if player.doublejump_countdown == 0 {
                player.doublejump_countdown = 14;
            }
            player.velocity_y = -2.9 + SPEED_JUMP_Y[player.speed_jump as usize];
            if player.speed_jump < 6 && !player.last_was_jump && player.key_left != player.key_right
            {
                player.speed_jump_dir = if player.key_left { -1 } else { 1 };
                player.speed_jump += 1;
            }
        }
        jumped = true;
    } else if player.is_on_ground() && player.speed_jump > 0 && !player.key_down {
        player.speed_jump = 0;
    }

    player.last_was_jump = jumped;
}

fn handle_crouch(player: &mut PlayerState) {
    if !player.key_up && player.key_down {
        player.crouch = player.is_on_ground() || player.is_brick_crouch_on_head();
    } else {
        player.crouch = player.is_on_ground() && player.is_brick_crouch_on_head();
    }
}

fn handle_horizontal_movement(player: &mut PlayerState) {
    if player.key_left == player.key_right {
        return;
    }

    let mut max_vel = PLAYER_MAX_VELOCITY_X;
    if player.crouch {
        max_vel -= 1.0;
    }

    let sign = if player.key_left { -1.0 } else { 1.0 };
    if player.velocity_x * sign < 0.0 {
        player.velocity_x += sign * 0.8;
    }

    let abs_vel = player.velocity_x.abs();
    if abs_vel < max_vel {
        player.velocity_x += sign * 0.35;
    } else if abs_vel > max_vel {
        player.velocity_x = sign * max_vel;
    }
}

fn get_speed_x(player: &PlayerState) -> f32 {
    if player.velocity_x != 0.0 {
        player.velocity_x.signum() * SPEED_JUMP_X[player.speed_jump as usize]
    } else {
        0.0
    }
}

fn check_ground(map: &GameMap, col_l: i32, col_r: i32, y: f32) -> bool {
    let row_probe = trunc_i32((y + GROUND_PROBE) / TILE_H);
    if row_probe >= map.rows {
        return true;
    }

    let row_inside = trunc_i32((y + PLAYER_HALF_H - 1.0) / TILE_H);
    let row_body = trunc_i32((y + PLAYER_CROUCH_HALF_H) / TILE_H);

    (map.is_brick(col_l, row_probe) && !map.is_brick(col_l, row_inside))
        || (map.is_brick(col_r, row_probe) && !map.is_brick(col_r, row_inside))
        || (map.is_brick(col_l, trunc_i32((y + PLAYER_HALF_H) / TILE_H))
            && !map.is_brick(col_l, row_body))
        || (map.is_brick(col_r, trunc_i32((y + PLAYER_HALF_H) / TILE_H))
            && !map.is_brick(col_r, row_body))
}

fn check_head(map: &GameMap, col_l: i32, col_r: i32, y: f32) -> bool {
    let row_probe = trunc_i32((y - HEAD_PROBE) / TILE_H);
    if row_probe < 0 {
        return true;
    }
    let row_inside = trunc_i32((y - PLAYER_HALF_H + 1.0) / TILE_H);
    let row_body = trunc_i32((y - PLAYER_CROUCH_HALF_H) / TILE_H);

    (map.is_brick(col_l, row_probe) && !map.is_brick(col_l, row_inside))
        || (map.is_brick(col_r, row_probe) && !map.is_brick(col_r, row_inside))
        || (map.is_brick(col_l, trunc_i32((y - PLAYER_HALF_H) / TILE_H))
            && !map.is_brick(col_l, row_body))
        || (map.is_brick(col_r, trunc_i32((y - PLAYER_HALF_H) / TILE_H))
            && !map.is_brick(col_r, row_body))
}

fn check_crouch_head(map: &GameMap, col_l: i32, col_r: i32, y: f32) -> bool {
    let row_probe = trunc_i32((y - CROUCH_HEAD_PROBE) / TILE_H);
    let row_inside = trunc_i32((y - 7.0) / TILE_H);

    (map.is_brick(col_l, row_probe) && !map.is_brick(col_l, row_inside))
        || (map.is_brick(col_r, row_probe) && !map.is_brick(col_r, row_inside))
        || map.is_brick(col_l, trunc_i32((y - 23.0) / TILE_H))
        || map.is_brick(col_r, trunc_i32((y - 23.0) / TILE_H))
        || map.is_brick(col_l, trunc_i32((y - 16.0) / TILE_H))
        || map.is_brick(col_r, trunc_i32((y - 16.0) / TILE_H))
}

fn trunc_i32(val: f32) -> i32 {
    val.trunc() as i32
}

fn round(val: f32) -> f32 {
    val.round()
}

fn clamp(val: f32, min: f32, max: f32) -> f32 {
    if val < min {
        min
    } else if val > max {
        max
    } else {
        val
    }
}
