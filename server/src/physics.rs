use physics_core::step::step_player as core_step_player;

use crate::map::GameMap;

pub use physics_core::types::PlayerState;

pub fn step_player(player: &mut PlayerState, map: &GameMap) {
    let input = physics_core::types::PlayerInput {
        key_up: player.key_up,
        key_down: player.key_down,
        key_left: player.key_left,
        key_right: player.key_right,
    };

    core_step_player(player, input, map);
}
