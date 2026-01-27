import * as PIXI from 'pixi.js'
import { Console } from '../../helpers'

console.log('=== APP.JS MODULE LOADED ===')

let app = null
let renderer = null
let stage = null

export const world = new PIXI.Container()

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

export async function initRenderer() {
    if (app) return app

    console.log('boot: renderer init start')
    const nextApp = new PIXI.Application()

    try {
        console.log('boot: about to check webgpu support')
        console.log('boot: PIXI.isWebGPUSupported exists:', typeof PIXI.isWebGPUSupported)

        // Skip PIXI's check, use native detection
        const hasWebGPU = !!navigator.gpu
        console.log('boot: hasWebGPU:', hasWebGPU)

        const canvas = document.createElement('canvas')
        console.log('boot: canvas created')

        console.log('boot: calling nextApp.init')
        await nextApp.init({
            width: innerWidth,
            height: innerHeight,
            background: 0x262626,
            preference: hasWebGPU ? 'webgpu' : 'webgl',
            autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2),
            canvas,
        })
        console.log('boot: nextApp.init completed')
    } catch (err) {
        console.error('boot: init failed:', err)
        throw err
    }

    nextApp.canvas.style.display = 'block'
    document.getElementById('game')?.appendChild(nextApp.canvas)

    app = nextApp
    renderer = nextApp.renderer
    stage = nextApp.stage

    stage.addChild(world)
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
    stage.visible = false

    console.log('boot: renderer init ok')
    return app
}
export const getApp = () => app
export const getRenderer = () => renderer
export const getStage = () => stage
