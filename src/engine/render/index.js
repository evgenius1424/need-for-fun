import * as PIXI from 'pixi.js'
import { getTexture } from '../../assets'
import { getApp, getRenderer, getStage, world } from './app'
import { BG_TILE_SCALE } from './constants'
import { createHUD, updateHUD } from './hud'
import {
    cleanupBotSprite,
    initPlayerSprites,
    setPlayerColor,
    updateBotSprites,
    updatePlayerSprite,
    updateWeaponSprite,
} from './sprites'
import { renderMap, updateItemSprites } from './map'
import {
    addBulletImpact,
    addGauntletSpark,
    addRailShot,
    addShaftShot,
    renderAimLine,
    renderBulletImpacts,
    renderExplosions,
    renderGauntletSparks,
    renderProjectiles,
    renderRailShots,
    renderShaftShots,
    renderSmoke,
} from './effects'
import { initCamera, recalcCamera, updateCamera } from '../core/camera'

let bgSprite = null
const hud = createHUD()
let renderReady = false

export const Render = {
    initSprites,
    setSceneReady,
    renderGame,
    renderMap,
    setPlayerColor,
    cleanupBotSprite,
    addRailShot,
    addShaftShot,
    addBulletImpact,
    addGauntletSpark,
}

function initSprites(player) {
    ensureRenderInit()
    bgSprite = createBackground()
    if (bgSprite) world.addChildAt(bgSprite, 0)
    initPlayerSprites(player)
}

function setSceneReady(visible) {
    ensureRenderInit()
    const stage = getStage()
    if (!stage) return
    stage.visible = visible
    hud.container.visible = visible
}

function renderGame(player, bots = []) {
    ensureRenderInit()
    const app = getApp()
    if (!app) return
    updateCamera(player)
    renderPlayers(player, bots)
    renderEffects(player)
    updateHUD(player, hud)
    app.render()
}

function createBackground() {
    const texture = getTexture('background')
    if (!texture) return null

    const sprite = new PIXI.TilingSprite({
        texture,
        width: innerWidth,
        height: innerHeight,
    })
    sprite.tileScale.set(BG_TILE_SCALE)
    return sprite
}

function renderPlayers(player, bots) {
    updatePlayerSprite(player)
    updateWeaponSprite(player)
    updateBotSprites(bots)
}

function renderEffects(player) {
    updateItemSprites()
    renderSmoke()
    renderProjectiles()
    renderExplosions()
    renderRailShots()
    renderShaftShots()
    renderBulletImpacts()
    renderGauntletSparks()
    renderAimLine(player)
}

function ensureRenderInit() {
    if (renderReady) return
    const renderer = getRenderer()
    const stage = getStage()
    if (!renderer || !stage) return

    stage.addChild(hud.container)
    initCamera({ renderer, world, hud, getBackgroundSprite: () => bgSprite })
    addEventListener('resize', recalcCamera)
    renderReady = true
}
