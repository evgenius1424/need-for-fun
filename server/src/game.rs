use rand::Rng;

use crate::constants::{
    BOUNDS_MARGIN, DAMAGE, FIRE_RATE, GAUNTLET_PLAYER_RADIUS,
    GAUNTLET_RANGE, GRENADE_AIR_FRICTION, GRENADE_BOUNCE_FRICTION, GRENADE_FUSE,
    GRENADE_HIT_GRACE, GRENADE_LOFT, GRENADE_MAX_FALL_SPEED, GRENADE_MIN_VELOCITY,
    GRENADE_RISE_DAMPING, HITSCAN_PLAYER_RADIUS, MACHINE_RANGE, PICKUP_RADIUS,
    PLASMA_SPLASH_DMG, PLASMA_SPLASH_PUSH, PLASMA_SPLASH_RADIUS, PLAYER_HALF_H,
    PROJECTILE_GRAVITY, PROJECTILE_SPEED, RAIL_RANGE, SELF_HIT_GRACE, SHAFT_RANGE,
    SHOTGUN_PELLETS, SHOTGUN_RANGE, SHOTGUN_SPREAD, SPLASH_RADIUS, TILE_H, TILE_W, WEAPON_PUSH,
};
use crate::map::GameMap;
use crate::physics::PlayerState;
use crate::protocol::EffectEvent;
use smallvec::SmallVec;

// Re-export Projectile types from physics_core
pub use physics_core::projectile::{Explosion, Projectile, ProjectileKind};

pub use crate::constants::WEAPON_COUNT;
pub type EventVec = SmallVec<[EffectEvent; 16]>;

const MAX_HEALTH: i32 = 100;
const MAX_ARMOR: i32 = 200;
const MEGA_HEALTH: i32 = 200;
const ARMOR_ABSORPTION: f32 = 0.67;
const SELF_DAMAGE_REDUCTION: f32 = 0.5;
const QUAD_MULTIPLIER: f32 = 3.0;
const QUAD_DURATION: i32 = 900;
const RESPAWN_TIME: i32 = 180;
const PUSH_LATERAL_FACTOR: f32 = 5.0 / 6.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeaponId {
    Gauntlet = 0,
    Machine = 1,
    Shotgun = 2,
    Grenade = 3,
    Rocket = 4,
    Rail = 5,
    Plasma = 6,
    Shaft = 7,
    Bfg = 8,
}

impl WeaponId {
    pub fn from_i32(value: i32) -> Option<Self> {
        match value {
            0 => Some(Self::Gauntlet),
            1 => Some(Self::Machine),
            2 => Some(Self::Shotgun),
            3 => Some(Self::Grenade),
            4 => Some(Self::Rocket),
            5 => Some(Self::Rail),
            6 => Some(Self::Plasma),
            7 => Some(Self::Shaft),
            8 => Some(Self::Bfg),
            _ => None,
        }
    }
}

pub fn can_fire(player: &PlayerState) -> bool {
    if player.dead || player.fire_cooldown > 0 {
        return false;
    }
    let weapon = player.current_weapon as usize;
    let ammo = player.ammo[weapon];
    ammo == -1 || ammo > 0
}

pub fn try_fire(
    player: &mut PlayerState,
    projectiles: &mut Vec<Projectile>,
    map: &GameMap,
    now_id: &mut u64,
    hitscan_actions: &mut Vec<HitAction>,
    events: &mut EventVec,
    rng: &mut impl Rng,
) {
    if !can_fire(player) {
        return;
    }

    let weapon = match WeaponId::from_i32(player.current_weapon) {
        Some(w) => w,
        None => return,
    };

    if player.ammo[player.current_weapon as usize] != -1 {
        player.ammo[player.current_weapon as usize] -= 1;
    }
    player.fire_cooldown = fire_rate(weapon);
    events.push(EffectEvent::WeaponFired {
        player_id: player.id,
        weapon_id: player.current_weapon,
    });

    match weapon {
        WeaponId::Gauntlet => {
            let (x, y) = get_weapon_origin(player);
            let hit_x = x + player.aim_angle.cos() * GAUNTLET_RANGE;
            let hit_y = y + player.aim_angle.sin() * GAUNTLET_RANGE;
            hitscan_actions.push(HitAction::Melee {
                attacker_id: player.id,
                weapon_id: weapon,
                hit_x,
                hit_y,
                damage: damage_for(weapon),
            });
            events.push(EffectEvent::Gauntlet { x: hit_x, y: hit_y });
        }
        WeaponId::Shotgun => {
            let (x, y) = get_weapon_origin(player);
            for _ in 0..SHOTGUN_PELLETS {
                let angle = player.aim_angle + (rng.gen::<f32>() - 0.5) * SHOTGUN_SPREAD;
                let trace = ray_trace(x, y, angle, SHOTGUN_RANGE, map);
                hitscan_actions.push(HitAction::Hitscan {
                    attacker_id: player.id,
                    weapon_id: weapon,
                    start_x: x,
                    start_y: y,
                    trace_x: trace.x,
                    trace_y: trace.y,
                    damage: damage_for(weapon),
                });
                events.push(EffectEvent::BulletImpact {
                    x: trace.x,
                    y: trace.y,
                    radius: 2.0,
                });
            }
        }
        WeaponId::Machine | WeaponId::Rail | WeaponId::Shaft => {
            let range = match weapon {
                WeaponId::Machine => MACHINE_RANGE,
                WeaponId::Rail => RAIL_RANGE,
                WeaponId::Shaft => SHAFT_RANGE,
                _ => MACHINE_RANGE,
            };
            let (x, y) = get_weapon_origin(player);
            let trace = ray_trace(x, y, player.aim_angle, range, map);
            hitscan_actions.push(HitAction::Hitscan {
                attacker_id: player.id,
                weapon_id: weapon,
                start_x: x,
                start_y: y,
                trace_x: trace.x,
                trace_y: trace.y,
                damage: damage_for(weapon),
            });
            match weapon {
                WeaponId::Rail => events.push(EffectEvent::Rail {
                    start_x: x,
                    start_y: y,
                    end_x: trace.x,
                    end_y: trace.y,
                }),
                WeaponId::Shaft => events.push(EffectEvent::Shaft {
                    start_x: x,
                    start_y: y,
                    end_x: trace.x,
                    end_y: trace.y,
                }),
                _ => events.push(EffectEvent::BulletImpact {
                    x: trace.x,
                    y: trace.y,
                    radius: 2.5,
                }),
            }
        }
        WeaponId::Grenade | WeaponId::Rocket | WeaponId::Plasma | WeaponId::Bfg => {
            let (x, y) = get_weapon_origin(player);
            let speed = projectile_speed(weapon);
            let cos = player.aim_angle.cos();
            let sin = player.aim_angle.sin();
            let (offset, loft, kind) = projectile_config(weapon);
            let mut velocity_x = cos * speed;
            let mut velocity_y = sin * speed - loft;
            if kind == ProjectileKind::Grenade {
                let slow = 0.8;
                velocity_x *= slow;
                velocity_y = velocity_y * slow + 0.9;
            }
            let proj_x = x + cos * offset;
            let proj_y = y + sin * offset;
            let id = next_id(now_id);
            events.push(EffectEvent::ProjectileSpawn {
                id,
                kind: kind.as_u8(),
                x: proj_x,
                y: proj_y,
                velocity_x,
                velocity_y,
                owner_id: player.id,
            });
            projectiles.push(Projectile {
                id,
                kind,
                x: proj_x,
                y: proj_y,
                prev_x: x,
                prev_y: y,
                velocity_x,
                velocity_y,
                owner_id: player.id,
                age: 0,
                active: true,
            });
        }
    }
}

#[derive(Clone, Debug)]
pub enum HitAction {
    Hitscan {
        attacker_id: u64,
        weapon_id: WeaponId,
        start_x: f32,
        start_y: f32,
        trace_x: f32,
        trace_y: f32,
        damage: f32,
    },
    Melee {
        attacker_id: u64,
        weapon_id: WeaponId,
        hit_x: f32,
        hit_y: f32,
        damage: f32,
    },
}

pub fn apply_hit_actions(
    actions: &[HitAction],
    players: &mut [PlayerState],
    events: &mut EventVec,
) {
    for action in actions {
        match *action {
            HitAction::Hitscan {
                attacker_id,
                weapon_id,
                start_x,
                start_y,
                trace_x,
                trace_y,
                damage,
            } => {
                if let Some(target_id) =
                    find_hitscan_target(attacker_id, start_x, start_y, trace_x, trace_y, players)
                {
                    apply_damage(attacker_id, target_id, damage, players, events);
                    if let Some((sx, sy)) = get_player_pos(attacker_id, players) {
                        apply_push_on_hit(attacker_id, target_id, weapon_id, sx, sy, players);
                    }
                }
            }
            HitAction::Melee {
                attacker_id,
                weapon_id,
                hit_x,
                hit_y,
                damage,
            } => {
                if let Some(target_id) = find_melee_target(attacker_id, hit_x, hit_y, players) {
                    apply_damage(attacker_id, target_id, damage, players, events);
                    if let Some((sx, sy)) = get_player_pos(attacker_id, players) {
                        apply_push_on_hit(attacker_id, target_id, weapon_id, sx, sy, players);
                    }
                }
            }
        }
    }
}

pub fn update_projectiles(map: &GameMap, projectiles: &mut Vec<Projectile>) -> Vec<Explosion> {
    let cols = map.cols as f32;
    let rows = map.rows as f32;
    let max_x = cols * TILE_W + BOUNDS_MARGIN;
    let max_y = rows * TILE_H + BOUNDS_MARGIN;

    let mut explosions = Vec::new();

    for proj in projectiles.iter_mut() {
        if !proj.active {
            continue;
        }
        proj.prev_x = proj.x;
        proj.prev_y = proj.y;
        proj.age += 1;

        if proj.kind == ProjectileKind::Grenade {
            apply_grenade_physics(proj);
        }

        let new_x = proj.x + proj.velocity_x;
        let new_y = proj.y + proj.velocity_y;

        if check_wall_collision(map, proj, new_x, new_y, &mut explosions) {
            continue;
        }

        proj.x = new_x;
        proj.y = new_y;

        if proj.kind == ProjectileKind::Grenade && proj.age > GRENADE_FUSE {
            explode(proj, &mut explosions);
            continue;
        }

        if proj.x < -BOUNDS_MARGIN || proj.x > max_x || proj.y < -BOUNDS_MARGIN || proj.y > max_y {
            proj.active = false;
        }
    }

    projectiles.retain(|p| p.active);
    explosions
}

pub fn apply_projectile_hits(
    projectiles: &mut Vec<Projectile>,
    players: &mut [PlayerState],
    events: &mut EventVec,
) -> Vec<Explosion> {
    let mut explosions = Vec::new();
    for proj in projectiles.iter_mut() {
        if !proj.active {
            continue;
        }
        let mut target_id: Option<u64> = None;
        for player in players.iter() {
            if player.dead {
                continue;
            }
            if proj.owner_id == player.id && proj.age < SELF_HIT_GRACE {
                continue;
            }
            if proj.kind == ProjectileKind::Grenade && proj.age < GRENADE_HIT_GRACE {
                continue;
            }
            if !check_player_collision(player, proj) {
                continue;
            }
            target_id = Some(player.id);
            break;
        }

        if let Some(target_id) = target_id {
            // Direct damage is 0 — all damage comes from splash explosion.
            let damage = match proj.kind {
                ProjectileKind::Rocket => 0.0,
                ProjectileKind::Grenade => 0.0,
                ProjectileKind::Plasma => damage_for(WeaponId::Plasma),
                ProjectileKind::Bfg => 0.0,
            };
            if damage > 0.0 {
                apply_damage(proj.owner_id, target_id, damage, players, events);
                apply_push_on_hit(
                    proj.owner_id,
                    target_id,
                    WeaponId::Plasma,
                    proj.x,
                    proj.y,
                    players,
                );
            }
            explode(proj, &mut explosions);
        }
    }

    projectiles.retain(|p| p.active);
    explosions
}

pub fn apply_explosions(
    explosions: &[Explosion],
    players: &mut [PlayerState],
    events: &mut EventVec,
) {
    let mut pending_hits: Vec<(u64, u64, f32)> = Vec::new();
    for explosion in explosions {
        let (radius, base_damage, push) = match explosion.kind {
            ProjectileKind::Rocket => (
                SPLASH_RADIUS[WeaponId::Rocket as usize],
                damage_for(WeaponId::Rocket),
                WEAPON_PUSH[WeaponId::Rocket as usize],
            ),
            ProjectileKind::Grenade => (
                SPLASH_RADIUS[WeaponId::Grenade as usize],
                damage_for(WeaponId::Grenade),
                WEAPON_PUSH[WeaponId::Grenade as usize],
            ),
            ProjectileKind::Plasma => (
                PLASMA_SPLASH_RADIUS,
                PLASMA_SPLASH_DMG,
                PLASMA_SPLASH_PUSH,
            ),
            ProjectileKind::Bfg => (
                SPLASH_RADIUS[WeaponId::Bfg as usize],
                damage_for(WeaponId::Bfg),
                WEAPON_PUSH[WeaponId::Bfg as usize],
            ),
        };

        if radius <= 0.0 {
            continue;
        }

        let attacker_quad = players
            .iter()
            .find(|p| p.id == explosion.owner_id)
            .map(|p| p.quad_damage)
            .unwrap_or(false);
        let push_scale = if attacker_quad { push * QUAD_MULTIPLIER } else { push };

        for player in players.iter_mut() {
            if player.dead {
                continue;
            }
            let dx = player.x - explosion.x;
            let dy = player.y - explosion.y;
            let distance = (dx * dx + dy * dy).sqrt();
            if distance >= radius {
                continue;
            }

            let damage = explosion_falloff_damage(base_damage, radius, distance);
            if damage > 0.0 {
                pending_hits.push((explosion.owner_id, player.id, damage));
            }

            apply_push_explosion(player, explosion.x, explosion.y, push_scale);
        }
    }
    for (attacker_id, target_id, damage) in pending_hits {
        apply_damage(attacker_id, target_id, damage, players, events);
    }
}

pub fn process_item_pickups(players: &mut [PlayerState], items: &mut [crate::map::MapItem]) {
    for item in items.iter_mut() {
        if !item.active {
            item.respawn_timer -= 1;
            if item.respawn_timer <= 0 {
                item.active = true;
            }
            continue;
        }
        for player in players.iter_mut() {
            if player.dead {
                continue;
            }
            if !is_player_near_item(player, item) {
                continue;
            }
            apply_item_effect(player, item);
            item.active = false;
            item.respawn_timer = item.kind.respawn_time();
            break;
        }
    }
}

pub fn respawn_if_ready_with_rng(player: &mut PlayerState, map: &GameMap, rng: &mut impl Rng) {
    if !player.dead || player.respawn_timer > 0 {
        return;
    }
    if let Some((row, col)) = map.random_respawn_with_rng(rng) {
        let x = col as f32 * TILE_W + 10.0;
        let y = row as f32 * TILE_H - PLAYER_HALF_H;
        player.set_xy(x, y, map);
        player.prev_x = player.x;
        player.prev_y = player.y;
    }
    player.health = MAX_HEALTH;
    player.armor = 0;
    player.dead = false;
    player.velocity_x = 0.0;
    player.velocity_y = 0.0;
    player.weapons = [true; WEAPON_COUNT];
    player.ammo = [-1, 100, 10, 5, 20, 10, 30, 50, 10];
    player.current_weapon = WeaponId::Rocket as i32;
    player.quad_damage = false;
    player.quad_timer = 0;
    player.spawn_protection = 120;
}

fn apply_damage(
    attacker_id: u64,
    target_id: u64,
    damage: f32,
    players: &mut [PlayerState],
    events: &mut EventVec,
) {
    let attacker_quad = players
        .iter()
        .find(|p| p.id == attacker_id)
        .map(|p| p.quad_damage)
        .unwrap_or(false);
    let multiplier = if attacker_quad { QUAD_MULTIPLIER } else { 1.0 };
    let mut actual = damage * multiplier;

    for player in players.iter_mut() {
        if player.id != target_id {
            continue;
        }
        if player.dead || player.spawn_protection > 0 {
            return;
        }
        if attacker_id == target_id {
            actual *= SELF_DAMAGE_REDUCTION;
        }

        if player.armor > 0 {
            let armor_damage = (actual * ARMOR_ABSORPTION).floor() as i32;
            let absorbed = armor_damage.min(player.armor);
            player.armor -= absorbed;
            actual -= absorbed as f32;
        }

        let rounded = actual.floor() as i32;
        player.health -= rounded;
        let killed = player.health <= 0;
        if killed {
            player.dead = true;
            player.respawn_timer = RESPAWN_TIME;
        }
        if rounded > 0 {
            events.push(EffectEvent::Damage {
                attacker_id,
                target_id,
                amount: rounded,
                killed,
            });
        }
        break;
    }
}

fn get_player_pos(player_id: u64, players: &[PlayerState]) -> Option<(f32, f32)> {
    players.iter().find(|p| p.id == player_id).map(|p| (p.x, p.y))
}

fn apply_push_on_hit(
    attacker_id: u64,
    target_id: u64,
    weapon_id: WeaponId,
    source_x: f32,
    source_y: f32,
    players: &mut [PlayerState],
) {
    let mut strength = WEAPON_PUSH[weapon_id as usize];
    if strength <= 0.0 {
        return;
    }
    let attacker_quad = players.iter().any(|p| p.id == attacker_id && p.quad_damage);
    if attacker_quad {
        strength *= QUAD_MULTIPLIER;
    }
    if let Some(target) = players.iter_mut().find(|p| p.id == target_id && !p.dead) {
        apply_push_impulse(target, source_x, source_y, strength);
    }
}

fn apply_push_explosion(player: &mut PlayerState, source_x: f32, source_y: f32, strength: f32) {
    if strength <= 0.0 {
        return;
    }
    apply_push_impulse(player, source_x, source_y, strength);
}

fn apply_push_impulse(player: &mut PlayerState, source_x: f32, source_y: f32, strength: f32) {
    // Asymmetry: stronger when source is left/below; only upward kick from explosions below.
    let dx = source_x - player.x;
    let dy = source_y - player.y;
    if dx < -0.01 {
        player.velocity_x += strength;
    } else if dx > 0.01 {
        player.velocity_x -= strength * PUSH_LATERAL_FACTOR;
    }
    if dy > 0.01 {
        player.velocity_y -= strength * PUSH_LATERAL_FACTOR;
    }
}

fn explosion_falloff_damage(base: f32, radius: f32, distance: f32) -> f32 {
    // Splash curve: piecewise falloff with small additive bias.
    const MID_BIAS: f32 = 40.0;
    const MID_SCALE: f32 = 100.0;
    const FAR_SCALE: f32 = 60.0;
    const FAR_BIAS: f32 = 20.0;

    if radius <= 0.0 || distance <= 0.0 {
        return base.max(0.0);
    }
    let r3 = radius / 3.0;
    if distance <= r3 {
        return base;
    }
    if distance < 2.0 * r3 {
        let scaled = (2.0 * radius - distance * 3.0 + MID_BIAS) / MID_SCALE;
        return (base * scaled).max(0.0);
    }
    let scaled = ((radius - distance) * FAR_SCALE / radius + FAR_BIAS) / MID_SCALE;
    (base * scaled).max(0.0)
}

fn is_player_near_item(player: &PlayerState, item: &crate::map::MapItem) -> bool {
    let x = item.col as f32 * TILE_W + TILE_W / 2.0;
    let y = item.row as f32 * TILE_H + TILE_H / 2.0;
    let dx = player.x - x;
    let dy = player.y - y;
    (dx * dx + dy * dy).sqrt() <= PICKUP_RADIUS
}

fn apply_item_effect(player: &mut PlayerState, item: &crate::map::MapItem) {
    use crate::map::ItemKind;

    match item.kind {
        ItemKind::Health5 => {
            player.health = (player.health + 5).min(MAX_HEALTH);
        }
        ItemKind::Health25 => {
            player.health = (player.health + 25).min(MAX_HEALTH);
        }
        ItemKind::Health50 => {
            player.health = (player.health + 50).min(MAX_HEALTH);
        }
        ItemKind::Health100 => {
            player.health = (player.health + 100).min(MEGA_HEALTH);
        }
        ItemKind::Armor50 => {
            player.armor = (player.armor + 50).min(MAX_ARMOR);
        }
        ItemKind::Armor100 => {
            player.armor = (player.armor + 100).min(MAX_ARMOR);
        }
        ItemKind::Quad => {
            player.quad_damage = true;
            player.quad_timer = QUAD_DURATION;
        }
        ItemKind::WeaponMachine => give_weapon(player, WeaponId::Machine, 50),
        ItemKind::WeaponShotgun => give_weapon(player, WeaponId::Shotgun, 10),
        ItemKind::WeaponGrenade => give_weapon(player, WeaponId::Grenade, 5),
        ItemKind::WeaponRocket => give_weapon(player, WeaponId::Rocket, 5),
    }
}

fn give_weapon(player: &mut PlayerState, weapon: WeaponId, ammo: i32) {
    let idx = weapon as usize;
    player.weapons[idx] = true;
    if player.ammo[idx] != -1 {
        player.ammo[idx] += ammo;
    }
}

fn damage_for(weapon: WeaponId) -> f32 {
    DAMAGE[weapon as usize]
}

fn fire_rate(weapon: WeaponId) -> i32 {
    FIRE_RATE[weapon as usize]
}

fn projectile_speed(weapon: WeaponId) -> f32 {
    PROJECTILE_SPEED[weapon as usize]
}

fn projectile_config(weapon: WeaponId) -> (f32, f32, ProjectileKind) {
    match weapon {
        WeaponId::Grenade => (14.0, GRENADE_LOFT, ProjectileKind::Grenade),
        WeaponId::Rocket => (18.0, 0.0, ProjectileKind::Rocket),
        WeaponId::Plasma => (12.0, 0.0, ProjectileKind::Plasma),
        WeaponId::Bfg => (12.0, 0.0, ProjectileKind::Bfg),
        _ => (12.0, 0.0, ProjectileKind::Rocket),
    }
}

fn get_weapon_origin(player: &PlayerState) -> (f32, f32) {
    let crouch_lift = 4.0;
    let y = if player.crouch {
        player.y + crouch_lift
    } else {
        player.y
    };
    (player.x, y)
}

fn ray_trace(start_x: f32, start_y: f32, angle: f32, max_distance: f32, map: &GameMap) -> Trace {
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

        if map.is_brick(map_x, map_y) {
            hit = true;
        }
    }

    if !hit {
        return Trace {
            x: start_x + dir_x * max_distance,
            y: start_y + dir_y * max_distance,
        };
    }

    let (hit_x, hit_y) = if side == 0 {
        let hx = (map_x + if step_x == -1 { 1 } else { 0 }) as f32 * TILE_W;
        let hy = start_y + ((hx - start_x) / dir_x) * dir_y;
        (hx, hy)
    } else {
        let hy = (map_y + if step_y == -1 { 1 } else { 0 }) as f32 * TILE_H;
        let hx = start_x + ((hy - start_y) / dir_y) * dir_x;
        (hx, hy)
    };

    Trace { x: hit_x, y: hit_y }
}

struct Trace {
    x: f32,
    y: f32,
}

fn find_hitscan_target(
    attacker_id: u64,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
    players: &[PlayerState],
) -> Option<u64> {
    let dx = end_x - start_x;
    let dy = end_y - start_y;
    let len_sq = if dx == 0.0 && dy == 0.0 {
        1.0
    } else {
        dx * dx + dy * dy
    };

    let mut closest_id = None;
    let mut closest_t = f32::INFINITY;

    for target in players {
        if target.dead || target.id == attacker_id {
            continue;
        }
        let t = ((target.x - start_x) * dx + (target.y - start_y) * dy) / len_sq;
        if !(0.0..=1.0).contains(&t) {
            continue;
        }
        let hit_x = start_x + dx * t;
        let hit_y = start_y + dy * t;
        let dist_x = target.x - hit_x;
        let dist_y = target.y - hit_y;
        let dist_sq = dist_x * dist_x + dist_y * dist_y;
        if dist_sq > HITSCAN_PLAYER_RADIUS * HITSCAN_PLAYER_RADIUS {
            continue;
        }
        if t < closest_t {
            closest_t = t;
            closest_id = Some(target.id);
        }
    }
    closest_id
}

fn find_melee_target(
    attacker_id: u64,
    hit_x: f32,
    hit_y: f32,
    players: &[PlayerState],
) -> Option<u64> {
    let mut closest_id = None;
    let mut closest_dist_sq = f32::INFINITY;
    for target in players {
        if target.dead || target.id == attacker_id {
            continue;
        }
        let dx = target.x - hit_x;
        let dy = target.y - hit_y;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq > GAUNTLET_PLAYER_RADIUS * GAUNTLET_PLAYER_RADIUS {
            continue;
        }
        if dist_sq < closest_dist_sq {
            closest_dist_sq = dist_sq;
            closest_id = Some(target.id);
        }
    }
    closest_id
}

fn check_player_collision(player: &PlayerState, proj: &Projectile) -> bool {
    let dx = player.x - proj.x;
    let dy = player.y - proj.y;
    let radius = proj.kind.hit_radius();
    dx * dx + dy * dy < radius * radius
}

fn apply_grenade_physics(proj: &mut Projectile) {
    proj.velocity_y += PROJECTILE_GRAVITY;
    if proj.velocity_y < 0.0 {
        proj.velocity_y /= GRENADE_RISE_DAMPING;
    }
    proj.velocity_x /= GRENADE_AIR_FRICTION;
    if proj.velocity_y > GRENADE_MAX_FALL_SPEED {
        proj.velocity_y = GRENADE_MAX_FALL_SPEED;
    }
}

fn check_wall_collision(
    map: &GameMap,
    proj: &mut Projectile,
    new_x: f32,
    new_y: f32,
    explosions: &mut Vec<Explosion>,
) -> bool {
    let col_x = (new_x / TILE_W).floor() as i32;
    let col_y = (new_y / TILE_H).floor() as i32;
    if !map.is_brick(col_x, col_y) {
        return false;
    }

    if proj.kind != ProjectileKind::Grenade {
        explode(proj, explosions);
        return true;
    }

    let old_col_x = (proj.x / TILE_W).floor() as i32;
    let old_col_y = (proj.y / TILE_H).floor() as i32;
    if old_col_x != col_x {
        proj.velocity_x = -proj.velocity_x / GRENADE_BOUNCE_FRICTION;
    }
    if old_col_y != col_y {
        proj.velocity_y = -proj.velocity_y / GRENADE_BOUNCE_FRICTION;
    }
    if proj.velocity_x.abs() < GRENADE_MIN_VELOCITY && proj.velocity_y.abs() < GRENADE_MIN_VELOCITY
    {
        proj.velocity_x = 0.0;
        proj.velocity_y = 0.0;
    }
    false
}

fn explode(proj: &mut Projectile, explosions: &mut Vec<Explosion>) {
    proj.active = false;
    explosions.push(Explosion {
        x: proj.x,
        y: proj.y,
        kind: proj.kind,
        owner_id: proj.owner_id,
    });
}

fn next_id(counter: &mut u64) -> u64 {
    *counter += 1;
    *counter
}
