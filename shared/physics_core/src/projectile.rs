use crate::constants::{
    BOUNCE_DECAY, BOUNDS_MARGIN, GRENADE_FUSE, GRENADE_MIN_VELOCITY, HIT_RADIUS_BFG,
    HIT_RADIUS_GRENADE, HIT_RADIUS_PLASMA, HIT_RADIUS_ROCKET, PROJECTILE_GRAVITY, TILE_H, TILE_W,
};
use crate::tilemap::TileMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ProjectileKind {
    Rocket = 0,
    Grenade = 1,
    Plasma = 2,
    Bfg = 3,
}

impl ProjectileKind {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::Rocket),
            1 => Some(Self::Grenade),
            2 => Some(Self::Plasma),
            3 => Some(Self::Bfg),
            _ => None,
        }
    }

    pub fn as_u8(self) -> u8 {
        self as u8
    }

    pub fn hit_radius(self) -> f32 {
        match self {
            Self::Rocket => HIT_RADIUS_ROCKET,
            Self::Grenade => HIT_RADIUS_GRENADE,
            Self::Plasma => HIT_RADIUS_PLASMA,
            Self::Bfg => HIT_RADIUS_BFG,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Projectile {
    pub id: u64,
    pub kind: ProjectileKind,
    pub x: f32,
    pub y: f32,
    pub prev_x: f32,
    pub prev_y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub owner_id: u64,
    pub age: i32,
    pub active: bool,
}

impl Projectile {
    pub fn new(
        id: u64,
        kind: ProjectileKind,
        x: f32,
        y: f32,
        velocity_x: f32,
        velocity_y: f32,
        owner_id: u64,
    ) -> Self {
        Self {
            id,
            kind,
            x,
            y,
            prev_x: x,
            prev_y: y,
            velocity_x,
            velocity_y,
            owner_id,
            age: 0,
            active: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Explosion {
    pub x: f32,
    pub y: f32,
    pub kind: ProjectileKind,
    pub owner_id: u64,
}

/// Step a single projectile forward one tick.
/// Returns Some(Explosion) if the projectile exploded, None otherwise.
pub fn step_projectile(proj: &mut Projectile, map: &impl TileMap, bounds: (f32, f32)) -> Option<Explosion> {
    if !proj.active {
        return None;
    }

    proj.prev_x = proj.x;
    proj.prev_y = proj.y;
    proj.age += 1;

    if proj.kind == ProjectileKind::Grenade {
        apply_grenade_physics(proj);
    }

    let new_x = proj.x + proj.velocity_x;
    let new_y = proj.y + proj.velocity_y;

    if check_wall_collision(proj, new_x, new_y, map) {
        // For non-grenades, wall collision causes explosion
        if proj.kind != ProjectileKind::Grenade {
            return Some(explode(proj));
        }
        // Grenade bounced, continue without exploding
    } else {
        proj.x = new_x;
        proj.y = new_y;
    }

    // Grenade fuse timer
    if proj.kind == ProjectileKind::Grenade && proj.age > GRENADE_FUSE {
        return Some(explode(proj));
    }

    // Bounds check
    let (max_x, max_y) = bounds;
    if proj.x < -BOUNDS_MARGIN || proj.x > max_x || proj.y < -BOUNDS_MARGIN || proj.y > max_y {
        proj.active = false;
    }

    None
}

/// Apply grenade-specific physics (gravity with speed-based bonus, air resistance).
pub fn apply_grenade_physics(proj: &mut Projectile) {
    let speed = (proj.velocity_x * proj.velocity_x + proj.velocity_y * proj.velocity_y).sqrt();
    proj.velocity_y += PROJECTILE_GRAVITY + speed * 0.02;
    proj.velocity_x *= 0.995;
}

/// Check for wall collision and handle bouncing for grenades.
/// Returns true if a wall was hit.
fn check_wall_collision(proj: &mut Projectile, new_x: f32, new_y: f32, map: &impl TileMap) -> bool {
    let col_x = (new_x / TILE_W).floor() as i32;
    let col_y = (new_y / TILE_H).floor() as i32;

    if !map.is_solid(col_x, col_y) {
        return false;
    }

    if proj.kind != ProjectileKind::Grenade {
        // Non-grenades explode on wall hit (handled by caller)
        return true;
    }

    // Grenade bounces
    let old_col_x = (proj.x / TILE_W).floor() as i32;
    let old_col_y = (proj.y / TILE_H).floor() as i32;

    if old_col_x != col_x {
        proj.velocity_x *= -BOUNCE_DECAY;
    }
    if old_col_y != col_y {
        proj.velocity_y *= -BOUNCE_DECAY;
    }

    // Stop if velocity is too low
    if proj.velocity_x.abs() < GRENADE_MIN_VELOCITY
        && proj.velocity_y.abs() < GRENADE_MIN_VELOCITY
    {
        proj.velocity_x = 0.0;
        proj.velocity_y = 0.0;
    }

    true
}

/// Mark projectile as inactive and return explosion data.
fn explode(proj: &mut Projectile) -> Explosion {
    proj.active = false;
    Explosion {
        x: proj.x,
        y: proj.y,
        kind: proj.kind,
        owner_id: proj.owner_id,
    }
}

/// Calculate bounds for projectile out-of-bounds check.
pub fn calculate_bounds(cols: i32, rows: i32) -> (f32, f32) {
    let max_x = cols as f32 * TILE_W + BOUNDS_MARGIN;
    let max_y = rows as f32 * TILE_H + BOUNDS_MARGIN;
    (max_x, max_y)
}
