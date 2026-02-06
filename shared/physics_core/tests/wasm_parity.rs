#![cfg(all(target_arch = "wasm32", feature = "wasm"))]

use physics_core::step::step_player;
use physics_core::test_vectors::vectors;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn wasm_matches_native_golden_vectors() {
    for vector in vectors() {
        let mut player = vector.initial.clone();
        for _ in 0..vector.ticks {
            step_player(&mut player, vector.input, &vector.map);
        }
        assert!((player.y - vector.expected_y).abs() < 1e-4);
        assert!((player.velocity_y - vector.expected_vy).abs() < 1e-4);
    }
}
