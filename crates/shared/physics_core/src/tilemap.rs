pub trait TileMap {
    fn rows(&self) -> i32;
    fn cols(&self) -> i32;
    fn is_brick_at(&self, col: i32, row: i32) -> bool;

    fn is_solid(&self, col: i32, row: i32) -> bool {
        if row < 0 || col < 0 || row >= self.rows() || col >= self.cols() {
            return true;
        }
        self.is_brick_at(col, row)
    }
}

#[derive(Clone)]
pub struct FlatTileMap {
    rows: i32,
    cols: i32,
    bricks: Vec<u8>,
}

impl FlatTileMap {
    pub fn new(rows: i32, cols: i32, bricks: Vec<u8>) -> Self {
        Self { rows, cols, bricks }
    }

    #[inline]
    fn idx(&self, col: i32, row: i32) -> usize {
        row as usize * self.cols as usize + col as usize
    }

    pub fn bricks(&self) -> &[u8] {
        &self.bricks
    }

    pub fn bricks_mut(&mut self) -> &mut [u8] {
        &mut self.bricks
    }
}

impl TileMap for FlatTileMap {
    fn rows(&self) -> i32 {
        self.rows
    }

    fn cols(&self) -> i32 {
        self.cols
    }

    fn is_brick_at(&self, col: i32, row: i32) -> bool {
        self.bricks[self.idx(col, row)] != 0
    }
}
