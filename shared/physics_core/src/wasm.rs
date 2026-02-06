use wasm_bindgen::prelude::*;

use crate::step::step_player;
use crate::tilemap::{FlatTileMap, TileMap};
use crate::types::{PlayerInput, PlayerState};

const HOST_EXPORT_LEN: usize = 12;

#[wasm_bindgen]
pub struct WasmMap {
    inner: FlatTileMap,
}

#[wasm_bindgen]
impl WasmMap {
    #[wasm_bindgen(constructor)]
    pub fn new(rows: i32, cols: i32) -> Self {
        let len = (rows.max(0) as usize) * (cols.max(0) as usize);
        Self {
            inner: FlatTileMap::new(rows, cols, vec![0_u8; len]),
        }
    }

    pub fn upload_bricks(&mut self, bricks: &[u8]) {
        if bricks.len() == self.inner.bricks().len() {
            self.inner.bricks_mut().copy_from_slice(bricks);
        }
    }
}

#[wasm_bindgen]
pub struct WasmPlayerState {
    inner: PlayerState,
}

#[wasm_bindgen]
impl WasmPlayerState {
    #[wasm_bindgen(constructor)]
    pub fn new(id: u64) -> Self {
        Self {
            inner: PlayerState::new(id),
        }
    }

    pub fn import_host_state(
        &mut self,
        x: f32,
        y: f32,
        prev_x: f32,
        prev_y: f32,
        velocity_x: f32,
        velocity_y: f32,
        crouch: bool,
        doublejump_countdown: i32,
        speed_jump: i32,
        dead: bool,
        map: &WasmMap,
    ) {
        let moved =
            (self.inner.x - x).abs() > f32::EPSILON || (self.inner.y - y).abs() > f32::EPSILON;
        self.inner.x = x;
        self.inner.y = y;
        self.inner.prev_x = prev_x;
        self.inner.prev_y = prev_y;
        self.inner.velocity_x = velocity_x;
        self.inner.velocity_y = velocity_y;
        self.inner.crouch = crouch;
        self.inner.doublejump_countdown = doublejump_countdown;
        self.inner.speed_jump = speed_jump;
        self.inner.dead = dead;
        if moved {
            self.inner.recompute_caches(&map.inner);
        }
    }

    pub fn export_to_host(&self, out: &mut [f32]) {
        if out.len() < HOST_EXPORT_LEN {
            return;
        }
        out[0] = self.inner.x;
        out[1] = self.inner.y;
        out[2] = self.inner.prev_x;
        out[3] = self.inner.prev_y;
        out[4] = self.inner.velocity_x;
        out[5] = self.inner.velocity_y;
        out[6] = if self.inner.crouch { 1.0 } else { 0.0 };
        out[7] = self.inner.doublejump_countdown as f32;
        out[8] = self.inner.speed_jump as f32;
        out[9] = if self.inner.cache_on_ground { 1.0 } else { 0.0 };
        out[10] = if self.inner.cache_brick_on_head {
            1.0
        } else {
            0.0
        };
        out[11] = if self.inner.cache_brick_crouch_on_head {
            1.0
        } else {
            0.0
        };
    }
}

#[wasm_bindgen]
#[derive(Default)]
pub struct WasmPlayerInput {
    inner: PlayerInput,
}

#[wasm_bindgen]
impl WasmPlayerInput {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, key_up: bool, key_down: bool, key_left: bool, key_right: bool) {
        self.inner.key_up = key_up;
        self.inner.key_down = key_down;
        self.inner.key_left = key_left;
        self.inner.key_right = key_right;
    }
}

#[wasm_bindgen]
pub struct WasmPhysicsKernel;

#[wasm_bindgen]
impl WasmPhysicsKernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self
    }

    pub fn step_player(&self, state: &mut WasmPlayerState, input: &WasmPlayerInput, map: &WasmMap) {
        step_player(&mut state.inner, input.inner, &map.inner);
    }
}
