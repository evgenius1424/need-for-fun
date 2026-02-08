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
    let dir_x = angle.cos();
    let dir_y = angle.sin();

    let mut map_x = (start_x / TILE_W).floor() as i32;
    let mut map_y = (start_y / TILE_H).floor() as i32;

    let delta_dist_x = if dir_x == 0.0 {
        1e30
    } else {
        (1.0 / dir_x).abs()
    };
    let delta_dist_y = if dir_y == 0.0 {
        1e30
    } else {
        (1.0 / dir_y).abs()
    };

    let step_x = if dir_x < 0.0 { -1 } else { 1 };
    let step_y = if dir_y < 0.0 { -1 } else { 1 };

    let mut side_dist_x = if dir_x < 0.0 {
        (start_x / TILE_W - map_x as f32) * delta_dist_x
    } else {
        (map_x as f32 + 1.0 - start_x / TILE_W) * delta_dist_x
    };

    let mut side_dist_y = if dir_y < 0.0 {
        (start_y / TILE_H - map_y as f32) * delta_dist_y
    } else {
        (map_y as f32 + 1.0 - start_y / TILE_H) * delta_dist_y
    };

    let max_dist_sq = max_distance * max_distance;
    let mut hit = false;
    let mut side = 0;

    while !hit {
        if side_dist_x < side_dist_y {
            side_dist_x += delta_dist_x;
            map_x += step_x;
            side = 0;
        } else {
            side_dist_y += delta_dist_y;
            map_y += step_y;
            side = 1;
        }

        let check_x = (map_x as f32 + 0.5) * TILE_W - start_x;
        let check_y = (map_y as f32 + 0.5) * TILE_H - start_y;
        if check_x * check_x + check_y * check_y > max_dist_sq {
            break;
        }

        if map.is_solid(map_x, map_y) {
            hit = true;
        }
    }

    if !hit {
        return RayTraceResult {
            hit_wall: false,
            x: start_x + dir_x * max_distance,
            y: start_y + dir_y * max_distance,
            distance: max_distance,
        };
    }

    let (hit_x, hit_y, distance) = if side == 0 {
        let x = (map_x + if step_x == -1 { 1 } else { 0 }) as f32 * TILE_W;
        let y = start_y + ((x - start_x) / dir_x) * dir_y;
        let d = ((x - start_x) / dir_x).abs();
        (x, y, d)
    } else {
        let y = (map_y + if step_y == -1 { 1 } else { 0 }) as f32 * TILE_H;
        let x = start_x + ((y - start_y) / dir_y) * dir_x;
        let d = ((y - start_y) / dir_y).abs();
        (x, y, d)
    };

    RayTraceResult {
        hit_wall: true,
        x: hit_x,
        y: hit_y,
        distance,
    }
}

#[cfg(test)]
mod tests {
    use super::ray_trace;
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
}
