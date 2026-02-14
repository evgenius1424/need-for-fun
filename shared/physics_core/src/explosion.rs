use crate::constants::{
    DAMAGE, EXPLOSION_FAR_BIAS, EXPLOSION_FAR_SCALE, EXPLOSION_MID_BIAS, EXPLOSION_MID_SCALE,
    PLASMA_SPLASH_DMG, PLASMA_SPLASH_PUSH, PLASMA_SPLASH_RADIUS, SPLASH_RADIUS, WEAPON_PUSH,
};
use crate::projectile::{Explosion, ProjectileKind};
use crate::types::PlayerState;

const PUSH_LATERAL_FACTOR: f32 = 5.0 / 6.0;

/// Apply knockback from an explosion to a player.
/// Returns the damage falloff (0.0-1.0) if player was in radius, None otherwise.
pub fn apply_knockback(player: &mut PlayerState, explosion: &Explosion) -> Option<f32> {
    apply_knockback_with_scale(player, explosion, 1.0)
}

pub fn apply_knockback_with_scale(
    player: &mut PlayerState,
    explosion: &Explosion,
    push_scale: f32,
) -> Option<f32> {
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

    let falloff = explosion_damage_falloff(radius, distance);
    let scaled_push = push * push_scale;

    // Asymmetry: stronger when source is left/below; only upward kick from explosions below.
    if dx < -0.01 {
        player.velocity_x += scaled_push;
    } else if dx > 0.01 {
        player.velocity_x -= scaled_push * PUSH_LATERAL_FACTOR;
    }

    if dy > 0.01 {
        player.velocity_y -= scaled_push * PUSH_LATERAL_FACTOR;
    }

    Some(falloff)
}

/// Calculate explosion damage based on distance falloff and base damage.
pub fn calculate_explosion_damage(falloff: f32, base_damage: f32) -> f32 {
    base_damage * falloff
}

pub fn base_damage(kind: ProjectileKind) -> f32 {
    match kind {
        ProjectileKind::Rocket => DAMAGE[4],
        ProjectileKind::Grenade => DAMAGE[3],
        ProjectileKind::Plasma => PLASMA_SPLASH_DMG,
        ProjectileKind::Bfg => DAMAGE[8],
    }
}

pub fn explosion_damage_falloff(radius: f32, distance: f32) -> f32 {
    if radius <= 0.0 {
        return 0.0;
    }
    if distance <= 0.0 {
        return 1.0;
    }

    let r3 = radius / 3.0;
    if distance <= r3 {
        return 1.0;
    }
    if distance < 2.0 * r3 {
        let scaled = (2.0 * radius - distance * 3.0 + EXPLOSION_MID_BIAS) / EXPLOSION_MID_SCALE;
        return scaled.max(0.0);
    }
    let scaled = ((radius - distance) * EXPLOSION_FAR_SCALE / radius + EXPLOSION_FAR_BIAS)
        / EXPLOSION_MID_SCALE;
    scaled.max(0.0)
}
