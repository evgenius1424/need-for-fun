use std::fs;
use std::path::{Path, PathBuf};

use rand::seq::SliceRandom;
use rand::thread_rng;

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
            Self::Health5 => 300,
            Self::Health25 => 300,
            Self::Health50 => 600,
            Self::Health100 => 900,
            Self::Armor50 => 600,
            Self::Armor100 => 900,
            Self::Quad => 1200,
            Self::WeaponMachine => 600,
            Self::WeaponShotgun => 600,
            Self::WeaponGrenade => 600,
            Self::WeaponRocket => 600,
        }
    }
}

#[derive(Clone)]
pub struct GameMap {
    pub rows: i32,
    pub cols: i32,
    pub bricks: Vec<Vec<bool>>,
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

    pub fn is_brick(&self, col: i32, row: i32) -> bool {
        if row < 0 || col < 0 || row >= self.rows || col >= self.cols {
            return true;
        }
        self.bricks[row as usize][col as usize]
    }

    pub fn random_respawn(&self) -> Option<(i32, i32)> {
        let mut rng = thread_rng();
        self.respawns.choose(&mut rng).copied()
    }
}

fn parse_map(map_text: &str, map_name: &str) -> GameMap {
    let cleaned = map_text.replace("\r", "");
    let lines: Vec<&str> = cleaned.split('\n').collect();
    let rows = lines.len() as i32;
    let cols = lines.iter().map(|line| line.len()).max().unwrap_or(0) as i32;

    let mut bricks = vec![vec![false; cols as usize]; rows as usize];
    let mut respawns = Vec::new();
    let mut items = Vec::new();

    for (row_idx, line) in lines.iter().enumerate() {
        let row = row_idx as i32;
        for col in 0..cols {
            let ch = line.chars().nth(col as usize).unwrap_or(' ');
            let is_brick = matches!(ch, '0' | '1' | '2');
            bricks[row as usize][col as usize] = is_brick;

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
