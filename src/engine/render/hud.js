import * as PIXI from 'pixi.js'
import { WeaponConstants } from '../../helpers'

const HEALTH_THRESHOLDS = [
    { min: 100, color: 0x00aaff },
    { min: 50, color: 0x00ff00 },
    { min: 25, color: 0xffff00 },
    { min: 0, color: 0xff0000 },
]

const STYLES = {
    health: {
        fontFamily: 'Arial',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0x00ff00,
        stroke: 0x000000,
        strokeThickness: 3,
    },
    armor: {
        fontFamily: 'Arial',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xffff00,
        stroke: 0x000000,
        strokeThickness: 2,
    },
    weapon: {
        fontFamily: 'Arial',
        fontSize: 20,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 2,
    },
    ammo: {
        fontFamily: 'Arial',
        fontSize: 28,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 2,
    },
}

export function createHUD() {
    const container = new PIXI.Container()

    const health = createText('100', STYLES.health, { x: 20 })
    const armor = createText('0', STYLES.armor, { x: 20 })
    const weapon = createText('Machinegun', STYLES.weapon, { anchorX: 1 })
    const ammo = createText('100', STYLES.ammo, { anchorX: 1 })

    container.addChild(health, armor, weapon, ammo)
    return { container, health, armor, weapon, ammo }
}

export function updateHUD(player, hud) {
    const hp = Math.max(0, player.health)
    hud.health.text = hp.toString()
    hud.health.style.fill = getHealthColor(hp)

    hud.armor.text = player.armor.toString()
    hud.armor.visible = player.armor > 0

    hud.weapon.text = WeaponConstants.NAMES[player.currentWeapon]

    const ammo = player.ammo[player.currentWeapon]
    hud.ammo.text = ammo === -1 ? '∞' : ammo.toString()
}

function createText(text, style, { x = 0, y = 0, anchorX = 0, anchorY = 0 } = {}) {
    const t = new PIXI.Text(text, style)
    t.x = x
    t.y = y
    t.anchor.set(anchorX, anchorY)
    return t
}

function getHealthColor(hp) {
    for (const { min, color } of HEALTH_THRESHOLDS) {
        if (hp > min) return color
    }
    return HEALTH_THRESHOLDS.at(-1).color
}
