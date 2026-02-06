use crate::tilemap::FlatTileMap;
use crate::types::{PlayerInput, PlayerState};

pub struct GoldenVector {
    pub name: &'static str,
    pub map: FlatTileMap,
    pub initial: PlayerState,
    pub input: PlayerInput,
    pub ticks: usize,
    pub expected_y: f32,
    pub expected_vy: f32,
}

pub fn vectors() -> Vec<GoldenVector> {
    vec![open_map_fall_vector(), floor_collision_vector()]
}

fn open_map_fall_vector() -> GoldenVector {
    let map = FlatTileMap::new(8, 8, vec![0; 64]);
    let mut player = PlayerState::new(1);
    player.x = 64.0;
    player.y = 32.0;
    player.recompute_caches(&map);

    GoldenVector {
        name: "open_map_fall",
        map,
        initial: player,
        input: PlayerInput::default(),
        ticks: 10,
        expected_y: 36.639_202,
        expected_vy: 0.981_745_54,
    }
}

fn floor_collision_vector() -> GoldenVector {
    let mut bricks = vec![0_u8; 64];
    for col in 0..8 {
        bricks[7 * 8 + col] = 1;
    }
    let map = FlatTileMap::new(8, 8, bricks);
    let mut player = PlayerState::new(1);
    player.x = 64.0;
    player.y = 80.0;
    player.recompute_caches(&map);

    GoldenVector {
        name: "floor_collision",
        map,
        initial: player,
        input: PlayerInput::default(),
        ticks: 20,
        expected_y: 88.0,
        expected_vy: 0.0,
    }
}
