import * as PIXI from 'pixi.js'
import { Console } from '../core/helpers'

export const app = await initApp()
export const { renderer, stage } = app

export const world = new PIXI.Container()
stage.addChild(world)
stage.visible = false

export const tiles = new PIXI.Container()
export const smokeLayer = new PIXI.Container()
export const items = new PIXI.Container()
export const projectiles = new PIXI.Container()
export const explosionsLayer = new PIXI.Container()
export const aimLine = new PIXI.Graphics()
export const railLines = new PIXI.Graphics()
export const shaftLines = new PIXI.Graphics()
export const bulletImpacts = new PIXI.Graphics()
export const gauntletSparks = new PIXI.Graphics()

world.addChild(tiles)
world.addChild(smokeLayer)
world.addChild(projectiles)
world.addChild(items)
world.addChild(explosionsLayer)
world.addChild(aimLine)
world.addChild(railLines)
world.addChild(shaftLines)
world.addChild(bulletImpacts)
world.addChild(gauntletSparks)

async function initApp() {
    let app
    try {
        app = new PIXI.Application({
            width: innerWidth,
            height: innerHeight,
            backgroundColor: 0x262626,
            forceCanvas: false,
            autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2),
        })
    } catch (err) {
        Console.writeText(`renderer init failed: ${err?.message ?? err}`)
        throw err
    }
    app.view.style.display = 'block'
    document.getElementById('game').appendChild(app.view)
    return app
}
