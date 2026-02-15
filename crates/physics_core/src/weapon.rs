use crate::constants::{
    GRENADE_LOFT, MACHINE_RANGE, PROJECTILE_OFFSET, PROJECTILE_SPEED, RAIL_RANGE, SHAFT_RANGE,
    SHOTGUN_RANGE, TILE_H, TILE_W,
};
use crate::projectile::ProjectileKind;
use crate::tilemap::TileMap;

#[derive(Clone, Copy, Debug)]
pub struct ProjectileSpawn {
    pub kind: ProjectileKind,
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
}

/// Compute projectile spawn state for projectile weapons.
/// Returns None for non-projectile weapon ids.
pub fn compute_projectile_spawn(
    weapon_id: i32,
    origin_x: f32,
    origin_y: f32,
    aim_angle: f32,
) -> Option<ProjectileSpawn> {
    let kind = match weapon_id {
        3 => ProjectileKind::Grenade,
        4 => ProjectileKind::Rocket,
        6 => ProjectileKind::Plasma,
        8 => ProjectileKind::Bfg,
        _ => return None,
    };

    let idx = usize::try_from(weapon_id).ok()?;
    let speed = *PROJECTILE_SPEED.get(idx)?;
    let offset = *PROJECTILE_OFFSET.get(idx)?;

    let cos = aim_angle.cos();
    let sin = aim_angle.sin();
    let mut velocity_x = cos * speed;
    let mut velocity_y = sin * speed;

    if kind == ProjectileKind::Grenade {
        velocity_y -= GRENADE_LOFT;
        let slow = 0.8;
        velocity_x *= slow;
        velocity_y = velocity_y * slow + 0.9;
    }

    Some(ProjectileSpawn {
        kind,
        x: origin_x + cos * offset,
        y: origin_y + sin * offset,
        velocity_x,
        velocity_y,
    })
}

pub fn hitscan_range(weapon_id: i32) -> Option<f32> {
    match weapon_id {
        1 => Some(MACHINE_RANGE),
        2 => Some(SHOTGUN_RANGE),
        5 => Some(RAIL_RANGE),
        7 => Some(SHAFT_RANGE),
        _ => None,
    }
}

#[derive(Clone, Copy, Debug)]
pub struct RayTraceResult {
    pub hit_wall: bool,
    pub x: f32,
    pub y: f32,
    pub distance: f32,
}

pub fn ray_trace(
    map: &impl TileMap,
    start_x: f32,
    start_y: f32,
    angle: f32,
    max_distance: f32,
) -> RayTraceResult {
    if max_distance <= 0.0 {
        return RayTraceResult {
            hit_wall: false,
            x: start_x,
            y: start_y,
            distance: 0.0,
        };
    }

    let dir_x = angle.cos();
    let dir_y = angle.sin();

    let mut cell_x = (start_x / TILE_W).floor() as i32;
    let mut cell_y = (start_y / TILE_H).floor() as i32;

    if map.is_solid(cell_x, cell_y) {
        return RayTraceResult {
            hit_wall: true,
            x: start_x,
            y: start_y,
            distance: 0.0,
        };
    }

    let t_delta_x = if dir_x == 0.0 {
        f32::INFINITY
    } else {
        TILE_W / dir_x.abs()
    };
    let t_delta_y = if dir_y == 0.0 {
        f32::INFINITY
    } else {
        TILE_H / dir_y.abs()
    };

    let step_x = if dir_x < 0.0 { -1 } else { 1 };
    let step_y = if dir_y < 0.0 { -1 } else { 1 };

    let mut t_max_x = if dir_x == 0.0 {
        f32::INFINITY
    } else if dir_x < 0.0 {
        let boundary_x = cell_x as f32 * TILE_W;
        (boundary_x - start_x) / dir_x
    } else {
        let boundary_x = (cell_x as f32 + 1.0) * TILE_W;
        (boundary_x - start_x) / dir_x
    };
    let mut t_max_y = if dir_y == 0.0 {
        f32::INFINITY
    } else if dir_y < 0.0 {
        let boundary_y = cell_y as f32 * TILE_H;
        (boundary_y - start_y) / dir_y
    } else {
        let boundary_y = (cell_y as f32 + 1.0) * TILE_H;
        (boundary_y - start_y) / dir_y
    };

    loop {
        let (next_t, side) = if t_max_x < t_max_y {
            (t_max_x, 0_u8)
        } else {
            (t_max_y, 1_u8)
        };

        if next_t > max_distance {
            break;
        }

        if side == 0 {
            cell_x += step_x;
            if map.is_solid(cell_x, cell_y) {
                return RayTraceResult {
                    hit_wall: true,
                    x: start_x + dir_x * next_t,
                    y: start_y + dir_y * next_t,
                    distance: next_t,
                };
            }
            t_max_x += t_delta_x;
        } else {
            cell_y += step_y;
            if map.is_solid(cell_x, cell_y) {
                return RayTraceResult {
                    hit_wall: true,
                    x: start_x + dir_x * next_t,
                    y: start_y + dir_y * next_t,
                    distance: next_t,
                };
            }
            t_max_y += t_delta_y;
        }
    }

    RayTraceResult {
        hit_wall: false,
        x: start_x + dir_x * max_distance,
        y: start_y + dir_y * max_distance,
        distance: max_distance,
    }
}

#[cfg(test)]
mod tests {
    use super::ray_trace;
    use crate::constants::{TILE_H, TILE_W};
    use crate::tilemap::FlatTileMap;

    #[test]
    fn ray_trace_hits_wall() {
        let mut bricks = vec![0_u8; 64];
        bricks[2 * 8 + 3] = 1;
        let map = FlatTileMap::new(8, 8, bricks);

        let hit = ray_trace(&map, 64.0, 40.0, 0.0, 200.0);

        assert!(hit.hit_wall);
        assert!((hit.x - 96.0).abs() < 1e-4);
        assert!((hit.y - 40.0).abs() < 1e-4);
    }

    #[test]
    fn ray_trace_stops_at_max_distance() {
        let map = FlatTileMap::new(8, 8, vec![0_u8; 64]);
        let hit = ray_trace(&map, 32.0, 16.0, 0.0, 25.0);

        assert!(!hit.hit_wall);
        assert!((hit.x - 57.0).abs() < 1e-4);
        assert!((hit.y - 16.0).abs() < 1e-4);
        assert!((hit.distance - 25.0).abs() < 1e-4);
    }

    #[test]
    fn ray_trace_hits_map_boundary() {
        let map = FlatTileMap::new(4, 4, vec![0_u8; 16]);
        let hit = ray_trace(&map, 96.0, 48.0, 0.0, 500.0);

        assert!(hit.hit_wall);
        assert!((hit.x - 128.0).abs() < 1e-4);
        assert!((hit.y - 48.0).abs() < 1e-4);
    }

    #[test]
    fn ray_trace_does_not_stop_mid_air_near_corner() {
        let map = FlatTileMap::new(8, 8, vec![0_u8; 64]);
        let angle = std::f32::consts::FRAC_PI_4;
        let hit = ray_trace(&map, 48.0, 48.0, angle, 64.0);

        assert!(!hit.hit_wall);
        assert!((hit.distance - 64.0).abs() < 1e-4);
        assert!((hit.x - (48.0 + angle.cos() * 64.0)).abs() < 1e-4);
        assert!((hit.y - (48.0 + angle.sin() * 64.0)).abs() < 1e-4);
    }

    #[test]
    fn ray_trace_horizontal_from_tile_boundary_is_stable() {
        let rows = 8;
        let cols = 8;
        let map = FlatTileMap::new(rows, cols, vec![0_u8; (rows * cols) as usize]);
        let start_x = TILE_W * 1.5;
        let start_y = TILE_H; // exactly on an interior tile boundary
        let hit = ray_trace(&map, start_x, start_y, 0.0, 500.0);

        assert!(hit.hit_wall);
        assert!(hit.x.is_finite());
        assert!(hit.y.is_finite());
        assert!((hit.x - (cols as f32 * TILE_W)).abs() < 1e-4, "unexpected x={}", hit.x);
        assert!((hit.y - start_y).abs() < 1e-4, "unexpected y={}", hit.y);
    }
}
