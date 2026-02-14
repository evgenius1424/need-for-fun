use std::fs;
use std::path::{Path, PathBuf};

use rand::Rng;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemKind {
    Health5,
    Health25,
    Health50,
    Health100,
    Armor50,
    Armor100,
    Quad,
    WeaponMachine,
    WeaponShotgun,
    WeaponGrenade,
    WeaponRocket,
}

impl ItemKind {
    pub fn from_char(ch: char) -> Option<Self> {
        match ch {
            'H' => Some(Self::Health100),
            'h' => Some(Self::Health25),
            '5' => Some(Self::Health5),
            '6' => Some(Self::Health50),
            'A' => Some(Self::Armor100),
            'a' => Some(Self::Armor50),
            'Q' => Some(Self::Quad),
            'M' => Some(Self::WeaponMachine),
            'T' => Some(Self::WeaponShotgun),
            '3' => Some(Self::WeaponGrenade),
            '4' => Some(Self::WeaponRocket),
            _ => None,
        }
    }

    pub fn respawn_time(self) -> i32 {
        match self {
            Self::Health5 | Self::Health25 => 300,
            Self::Health50 | Self::Armor50 => 600,
            Self::Health100 | Self::Armor100 => 900,
            Self::Quad => 1200,
            Self::WeaponMachine
            | Self::WeaponShotgun
            | Self::WeaponGrenade
            | Self::WeaponRocket => 600,
        }
    }
}

#[derive(Clone)]
pub struct GameMap {
    pub rows: i32,
    pub cols: i32,
    pub bricks: Vec<u8>,
    pub respawns: Vec<(i32, i32)>,
    pub items: Vec<MapItem>,
    pub name: String,
}

#[derive(Clone)]
pub struct MapItem {
    pub kind: ItemKind,
    pub row: i32,
    pub col: i32,
    pub active: bool,
    pub respawn_timer: i32,
}

impl GameMap {
    pub fn load(map_dir: &Path, map_name: &str) -> std::io::Result<Self> {
        let mut path = PathBuf::from(map_dir);
        path.push(format!("{map_name}.txt"));
        let content = fs::read_to_string(&path)?;
        Ok(parse_map(&content, map_name))
    }

    #[inline]
    fn idx(&self, col: i32, row: i32) -> usize {
        row as usize * self.cols as usize + col as usize
    }

    pub fn is_brick(&self, col: i32, row: i32) -> bool {
        if row < 0 || col < 0 || row >= self.rows || col >= self.cols {
            return true;
        }
        self.bricks[self.idx(col, row)] != 0
    }

    pub fn random_respawn_with_rng<R: Rng + ?Sized>(&self, rng: &mut R) -> Option<(i32, i32)> {
        if self.respawns.is_empty() {
            return None;
        }
        let idx = rng.gen_range(0..self.respawns.len());
        self.respawns.get(idx).copied()
    }

    pub fn take_items(&mut self) -> Vec<MapItem> {
        std::mem::take(&mut self.items)
    }
}

impl physics_core::tilemap::TileMap for GameMap {
    fn rows(&self) -> i32 {
        self.rows
    }

    fn cols(&self) -> i32 {
        self.cols
    }

    fn is_brick_at(&self, col: i32, row: i32) -> bool {
        self.is_brick(col, row)
    }
}

fn parse_map(map_text: &str, map_name: &str) -> GameMap {
    let rows_vec: Vec<&str> = map_text.trim_end_matches(['\r', '\n']).lines().collect();
    let rows = rows_vec.len() as i32;
    let cols = rows_vec.iter().map(|line| line.len()).max().unwrap_or(0) as i32;

    let mut bricks = vec![0_u8; rows.max(0) as usize * cols.max(0) as usize];
    let mut respawns = Vec::new();
    let mut items = Vec::new();

    for (row_idx, line) in rows_vec.iter().enumerate() {
        let row = row_idx as i32;
        for (col_idx, byte) in line.as_bytes().iter().copied().enumerate() {
            let col = col_idx as i32;
            let is_brick = matches!(byte, b'0' | b'1' | b'2');
            if is_brick {
                let idx = row as usize * cols as usize + col as usize;
                bricks[idx] = 1;
            }

            let ch = byte as char;
            if ch == 'R' {
                respawns.push((row, col));
            }

            if let Some(kind) = ItemKind::from_char(ch) {
                items.push(MapItem {
                    kind,
                    row,
                    col,
                    active: true,
                    respawn_timer: 0,
                });
            }
        }
    }

    GameMap {
        rows,
        cols,
        bricks,
        respawns,
        items,
        name: map_name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_map;

    #[test]
    fn parse_map_ignores_trailing_newline() {
        let map = parse_map("R0\n00\n", "test");
        assert_eq!(map.rows, 2);
        assert_eq!(map.cols, 2);
        assert!(map.is_brick(1, 0));
        assert!(map.is_brick(0, 1));
        assert_eq!(map.respawns, vec![(0, 0)]);
    }
}
