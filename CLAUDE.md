# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NFK-WEB is a WebGL port of "Need For Kill" - a 2D arena shooter inspired by Quake 3. The project aims to replicate the original game's physics model and gameplay balance using modern web technologies.

## Commands

```bash
npm run dev      # Start development server (Vite, port 8080, auto-opens browser)
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Architecture

### Core Files

- **src/main.js** - Entry point. Initializes stats display, loads map, creates player, and runs the game loop via `requestAnimationFrame`.

- **src/engine.js** - Contains two key exports:
    - `Render` - PIXI.js rendering (map graphics, player graphics, floating camera)
    - `Physics` - Fixed timestep physics (16ms frames). Handles gravity, velocity, collision response, jumping mechanics (including speedjump and doublejump systems)

- **src/player.js** - `Player` class with position, velocity, input states, and collision cache. Uses private methods to cache collision checks (ground, head, crouch) that only update when position changes.

- **src/map.js** - `Map` module. Loads maps from `?mapfile=name` or `?maptext=encoded` query params. Parses simple text format where `0` = brick, `R` = respawn point, space = empty.

- **src/helpers.js** - Shared utilities:
    - `Constants` (brick dimensions 32x16, max velocity)
    - `Keyboard` (arrow key state tracking)
    - `Console` (in-game console toggled with ~, commands: help, map, clear)
    - `Sound` (Howler.js jump sound)

### Physics System

The physics runs at fixed 16ms intervals. Key mechanics:

- Gravity: 0.056 per frame, with acceleration curves
- Speedjump: Accumulated jump bonuses (levels 0-6) when jumping while holding direction keys
- Doublejump: 14-frame countdown system allowing higher jumps after landing
- Collision: Brick-based grid collision using truncated coordinate checks

### Map Format

Text files in `public/maps/`. Each character:

- `0` = solid brick
- `R` = player respawn point
- Space = empty

Bricks render as 32x16 pixel rectangles.

### Rendering

PIXI.js Application renders to `#game` div. Camera either centers map (small maps) or follows player (large maps). Player rendered as 20x48 rectangle (20x32 when crouching).

### Controls

- Arrow keys: movement
- Down: crouch
- Tilde (~): toggle console
