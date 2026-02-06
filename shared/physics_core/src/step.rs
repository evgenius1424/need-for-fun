use crate::constants::{
    CROUCH_HEAD_OFFSET, CROUCH_HEAD_PROBE, GROUND_PROBE, HEAD_PROBE, PLAYER_CROUCH_HALF_H,
    PLAYER_HALF_H, PLAYER_MAX_VELOCITY_X, PLAYER_VELOCITY_CLAMP, SPEED_JUMP_X, SPEED_JUMP_Y,
    STAND_HEAD_OFFSET, TILE_H, TILE_W, WALL_PROBE_X_LEFT, WALL_PROBE_X_RIGHT, WALL_SNAP_LEFT,
    WALL_SNAP_RIGHT,
};
use crate::tilemap::TileMap;
use crate::types::{clamp, trunc_i32, PlayerInput, PlayerState};

pub fn step_player<M: TileMap + ?Sized>(player: &mut PlayerState, input: PlayerInput, map: &M) {
    player.key_up = input.key_up;
    player.key_down = input.key_down;
    player.key_left = input.key_left;
    player.key_right = input.key_right;

    player.prev_x = player.x;
    player.prev_y = player.y;

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

    debug_assert!(player.x.is_finite());
    debug_assert!(player.y.is_finite());
    debug_assert!(player.velocity_x.is_finite());
    debug_assert!(player.velocity_y.is_finite());
}

fn apply_physics<M: TileMap + ?Sized>(player: &mut PlayerState, map: &M) {
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
            let snap = trunc_i32(player.y.round() / TILE_H) as f32 * TILE_H + TILE_H / 2.0;
            player.set_xy(player.x, snap, map);
        } else if player.is_brick_crouch_on_head() && player.velocity_y < 0.0 {
            player.velocity_y = 0.0;
            player.doublejump_countdown = 3;
            let snap = trunc_i32(player.y.round() / TILE_H) as f32 * TILE_H + TILE_H / 2.0;
            player.set_xy(player.x, snap, map);
        }
    }

    if player.velocity_x != 0.0 {
        let col = trunc_i32(
            (start_x
                + if player.velocity_x < 0.0 {
                    WALL_PROBE_X_LEFT
                } else {
                    WALL_PROBE_X_RIGHT
                })
            .round()
                / TILE_W,
        );
        let check_y = if player.crouch { player.y } else { start_y };
        let head_off = if player.crouch {
            CROUCH_HEAD_OFFSET
        } else {
            STAND_HEAD_OFFSET
        };

        if map.is_solid(col, trunc_i32((check_y - head_off).round() / TILE_H))
            || map.is_solid(col, trunc_i32(check_y.round() / TILE_H))
            || map.is_solid(col, trunc_i32((check_y + TILE_H).round() / TILE_H))
        {
            let snap = trunc_i32(start_x / TILE_W) as f32 * TILE_W
                + if player.velocity_x < 0.0 {
                    WALL_SNAP_LEFT
                } else {
                    WALL_SNAP_RIGHT
                };
            player.set_xy(snap, player.y, map);
            player.velocity_x = 0.0;
            player.speed_jump = 0;
        }
    }

    if player.is_on_ground() && (player.is_brick_on_head() || player.velocity_y > 0.0) {
        player.velocity_y = 0.0;
        let snap = trunc_i32(player.y.round() / TILE_H) as f32 * TILE_H + TILE_H / 2.0;
        player.set_xy(player.x, snap, map);
    } else if player.is_brick_on_head() && player.velocity_y < 0.0 {
        player.velocity_y = 0.0;
        player.doublejump_countdown = 3;
    }

    player.velocity_x = clamp(
        player.velocity_x,
        -PLAYER_VELOCITY_CLAMP,
        PLAYER_VELOCITY_CLAMP,
    );
    player.velocity_y = clamp(
        player.velocity_y,
        -PLAYER_VELOCITY_CLAMP,
        PLAYER_VELOCITY_CLAMP,
    );
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

pub fn check_ground<M: TileMap + ?Sized>(map: &M, col_l: i32, col_r: i32, y: f32) -> bool {
    let row_probe = trunc_i32((y + GROUND_PROBE) / TILE_H);
    if row_probe >= map.rows() {
        return true;
    }

    let row_inside = trunc_i32((y + PLAYER_HALF_H - 1.0) / TILE_H);
    let row_body = trunc_i32((y + PLAYER_CROUCH_HALF_H) / TILE_H);

    (map.is_solid(col_l, row_probe) && !map.is_solid(col_l, row_inside))
        || (map.is_solid(col_r, row_probe) && !map.is_solid(col_r, row_inside))
        || (map.is_solid(col_l, trunc_i32((y + PLAYER_HALF_H) / TILE_H))
            && !map.is_solid(col_l, row_body))
        || (map.is_solid(col_r, trunc_i32((y + PLAYER_HALF_H) / TILE_H))
            && !map.is_solid(col_r, row_body))
}

pub fn check_head<M: TileMap + ?Sized>(map: &M, col_l: i32, col_r: i32, y: f32) -> bool {
    let row_probe = trunc_i32((y - HEAD_PROBE) / TILE_H);
    if row_probe < 0 {
        return true;
    }

    let row_inside = trunc_i32((y - PLAYER_HALF_H + 1.0) / TILE_H);
    let row_body = trunc_i32((y - PLAYER_CROUCH_HALF_H) / TILE_H);

    (map.is_solid(col_l, row_probe) && !map.is_solid(col_l, row_inside))
        || (map.is_solid(col_r, row_probe) && !map.is_solid(col_r, row_inside))
        || (map.is_solid(col_l, trunc_i32((y - PLAYER_HALF_H) / TILE_H))
            && !map.is_solid(col_l, row_body))
        || (map.is_solid(col_r, trunc_i32((y - PLAYER_HALF_H) / TILE_H))
            && !map.is_solid(col_r, row_body))
}

pub fn check_crouch_head<M: TileMap + ?Sized>(map: &M, col_l: i32, col_r: i32, y: f32) -> bool {
    let row_probe = trunc_i32((y - CROUCH_HEAD_PROBE) / TILE_H);
    let row_inside = trunc_i32((y - 7.0) / TILE_H);

    (map.is_solid(col_l, row_probe) && !map.is_solid(col_l, row_inside))
        || (map.is_solid(col_r, row_probe) && !map.is_solid(col_r, row_inside))
        || map.is_solid(col_l, trunc_i32((y - 23.0) / TILE_H))
        || map.is_solid(col_r, trunc_i32((y - 23.0) / TILE_H))
        || map.is_solid(col_l, trunc_i32((y - 16.0) / TILE_H))
        || map.is_solid(col_r, trunc_i32((y - 16.0) / TILE_H))
}

#[cfg(test)]
mod tests {
    use super::step_player;
    use crate::test_vectors::vectors;

    #[test]
    fn golden_vectors_native() {
        for vector in vectors() {
            let mut player = vector.initial.clone();
            for _ in 0..vector.ticks {
                step_player(&mut player, vector.input, &vector.map);
            }
            assert!(
                (player.y - vector.expected_y).abs() < 1e-4,
                "vector={} y mismatch: got {} expected {}",
                vector.name,
                player.y,
                vector.expected_y
            );
            assert!(
                (player.velocity_y - vector.expected_vy).abs() < 1e-4,
                "vector={} vy mismatch: got {} expected {}",
                vector.name,
                player.velocity_y,
                vector.expected_vy
            );
        }
    }
}
