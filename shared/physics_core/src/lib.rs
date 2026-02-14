#![forbid(unsafe_code)]
#![deny(rust_2018_idioms)]

pub mod constants;
pub mod explosion;
pub mod projectile;
pub mod step;
pub mod tilemap;
pub mod types;
pub mod weapon;

pub use explosion::apply_knockback;
pub use projectile::{calculate_bounds, step_projectile, Explosion, Projectile, ProjectileKind};
pub use step::step_player;

#[cfg(feature = "wasm")]
pub mod wasm;
