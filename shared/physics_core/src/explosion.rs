use crate::constants::EXPLOSION_RADIUS;
use crate::projectile::{Explosion, ProjectileKind};
use crate::types::PlayerState;

/// Apply knockback from an explosion to a player.
/// Only applies to rocket explosions.
/// Returns the damage falloff (0.0-1.0) if player was in radius, None otherwise.
pub fn apply_knockback(player: &mut PlayerState, explosion: &Explosion) -> Option<f32> {
    // Only rockets have knockback
    if explosion.kind != ProjectileKind::Rocket {
        return None;
    }

    let dx = player.x - explosion.x;
    let dy = player.y - explosion.y;
    let distance = (dx * dx + dy * dy).sqrt();

    if distance >= EXPLOSION_RADIUS {
        return None;
    }

    let falloff = 1.0 - distance / EXPLOSION_RADIUS;

    if distance > 0.0 {
        let knockback = (4.0 * falloff) / distance;
        player.velocity_x += dx * knockback;
        player.velocity_y += dy * knockback;
    }

    Some(falloff)
}

/// Calculate explosion damage based on distance falloff and base damage.
pub fn calculate_explosion_damage(falloff: f32, base_damage: f32) -> f32 {
    base_damage * falloff
}
