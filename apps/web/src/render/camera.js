import { Map } from '../game/map'
import { Physics, PhysicsConstants } from '../game/physics'

const camera = { float: false, halfW: 0, halfH: 0, dx: 0, dy: 0, scale: 1 }

let rendererRef = null
let worldRef = null
let hudRef = null
let getBackgroundSprite = () => null

export function initCamera({ renderer, world, hud, getBackgroundSprite: getBg }) {
    rendererRef = renderer
    worldRef = world
    hudRef = hud
    if (getBg) getBackgroundSprite = getBg
}

export function recalcCamera() {
    if (!rendererRef || !worldRef || !hudRef) return

    rendererRef.resize(innerWidth - 20, innerHeight)
    const mapW = Map.getCols() * PhysicsConstants.TILE_W
    const mapH = Map.getRows() * PhysicsConstants.TILE_H
    camera.float = mapH > innerHeight || mapW > innerWidth - 20

    if (camera.float) {
        camera.halfW = ((innerWidth - 20) / 2) | 0
        camera.halfH = (innerHeight / 2) | 0
        camera.scale = 1
    } else {
        camera.scale = Math.min((innerWidth - 20) / mapW, innerHeight / mapH, 1.6)
        camera.dx = ((innerWidth - 20 - mapW * camera.scale) / 2) | 0
        camera.dy = ((innerHeight - mapH * camera.scale) / 2) | 0
    }

    worldRef.scale.set(camera.scale)

    const bgSprite = getBackgroundSprite()
    if (bgSprite) {
        bgSprite.width = innerWidth
        bgSprite.height = innerHeight
    }

    hudRef.health.y = innerHeight - 50
    hudRef.armor.y = innerHeight - 80
    hudRef.weapon.x = innerWidth - 40
    hudRef.weapon.y = innerHeight - 50
    hudRef.ammo.x = innerWidth - 40
    hudRef.ammo.y = innerHeight - 80
    hudRef.netDebug.x = innerWidth - 20
    hudRef.netDebug.y = 20
}

export function updateCamera(player) {
    if (!worldRef) return

    const { x: renderX, y: renderY } = getRenderPosition(player)
    const bgSprite = getBackgroundSprite()

    if (camera.float) {
        worldRef.x = camera.halfW - renderX
        worldRef.y = camera.halfH - renderY
        if (bgSprite) {
            bgSprite.tilePosition.x = -renderX * 0.3
            bgSprite.tilePosition.y = -renderY * 0.3
            bgSprite.x = renderX - camera.halfW
            bgSprite.y = renderY - camera.halfH
        }
    } else {
        worldRef.x = camera.dx
        worldRef.y = camera.dy
        if (bgSprite) {
            bgSprite.x = -camera.dx
            bgSprite.y = -camera.dy
        }
    }
}

export function getRenderPosition(player) {
    const prevX = Number.isFinite(player.prevX) ? player.prevX : player.x
    const prevY = Number.isFinite(player.prevY) ? player.prevY : player.y
    const prevAim = Number.isFinite(player.prevAimAngle) ? player.prevAimAngle : player.aimAngle
    const alpha = Math.min(1, Math.max(0, Physics.getAlpha()))
    const renderX = prevX + (player.x - prevX) * alpha + (player.visualCorrectionX ?? 0)
    const renderY = prevY + (player.y - prevY) * alpha + (player.visualCorrectionY ?? 0)
    return {
        x: renderX,
        y: renderY,
        aimAngle: lerpAngle(prevAim, player.aimAngle, alpha),
    }
}

function lerpAngle(a, b, t) {
    let diff = b - a
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    return a + diff * t
}
