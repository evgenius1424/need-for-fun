use crate::constants::{PLASMA_SPLASH_PUSH, PLASMA_SPLASH_RADIUS, SPLASH_RADIUS, WEAPON_PUSH};
use crate::projectile::{Explosion, ProjectileKind};
use crate::types::PlayerState;

const PUSH_LATERAL_FACTOR: f32 = 5.0 / 6.0;

/// Apply knockback from an explosion to a player.
/// Returns the damage falloff (0.0-1.0) if player was in radius, None otherwise.
pub fn apply_knockback(player: &mut PlayerState, explosion: &Explosion) -> Option<f32> {
    let (radius, push) = match explosion.kind {
        ProjectileKind::Rocket => (SPLASH_RADIUS[4], WEAPON_PUSH[4]),
        ProjectileKind::Grenade => (SPLASH_RADIUS[3], WEAPON_PUSH[3]),
        ProjectileKind::Plasma => (PLASMA_SPLASH_RADIUS, PLASMA_SPLASH_PUSH),
        ProjectileKind::Bfg => (SPLASH_RADIUS[8], WEAPON_PUSH[8]),
    };

    if radius <= 0.0 {
        return None;
    }

    let dx = player.x - explosion.x;
    let dy = player.y - explosion.y;
    let distance = (dx * dx + dy * dy).sqrt();

    if distance >= radius {
        return None;
    }

    let falloff = 1.0 - distance / radius;

    // Asymmetry: stronger when source is left/below; only upward kick from explosions below.
    if dx < -0.01 {
        player.velocity_x += push;
    } else if dx > 0.01 {
        player.velocity_x -= push * PUSH_LATERAL_FACTOR;
    }

    if dy > 0.01 {
        player.velocity_y -= push * PUSH_LATERAL_FACTOR;
    }

    Some(falloff)
}

/// Calculate explosion damage based on distance falloff and base damage.
pub fn calculate_explosion_damage(falloff: f32, base_damage: f32) -> f32 {
    base_damage * falloff
}
