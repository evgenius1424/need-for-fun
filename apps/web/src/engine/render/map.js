import * as PIXI from 'pixi.js'
import { Constants } from '../../helpers'
import { Map } from '../../map'
import { getItemIcon, getTexture, getWeaponIcon } from '../../assets'
import { app, items, tiles } from './app'
import { WEAPON_ITEM_MAP } from './constants'
import { recalcCamera } from '../core/camera'

const { BRICK_WIDTH, BRICK_HEIGHT } = Constants
const { isBrick } = Map

const itemSprites = []

export function renderMap() {
    tiles.removeChildren()
    items.removeChildren()
    itemSprites.length = 0

    const rows = Map.getRows()
    const cols = Map.getCols()
    const brickTex = getTexture('brick')

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (!isBrick(col, row)) continue
            const sprite = new PIXI.Sprite(brickTex)
            sprite.x = col * BRICK_WIDTH
            sprite.y = row * BRICK_HEIGHT
            const tint = Map.getTileColor?.(col, row)
            if (tint) sprite.tint = tint
            tiles.addChild(sprite)
        }
    }

    for (const item of Map.getItems()) {
        const tex = item.type.startsWith('weapon_')
            ? getWeaponIcon(WEAPON_ITEM_MAP[item.type])
            : getItemIcon(item.type)
        if (!tex) continue

        const sprite = new PIXI.Sprite(tex)
        const scale = (BRICK_HEIGHT * 1.2) / Math.max(tex.width, tex.height)
        sprite.anchor.set(0.5)
        sprite.scale.set(scale)
        sprite.x = item.col * BRICK_WIDTH + BRICK_WIDTH / 2
        sprite.y = item.row * BRICK_HEIGHT + BRICK_HEIGHT / 2
        sprite.visible = item.active
        itemSprites.push({ item, sprite })
        items.addChild(sprite)
    }

    app.render()
    recalcCamera()
}

export function updateItemSprites() {
    for (const { item, sprite } of itemSprites) {
        sprite.visible = item.active
    }
}
