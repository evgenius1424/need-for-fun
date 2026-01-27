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

    Console.writeText('boot: renderer init start')
    console.log('boot: renderer init start')
    Console.writeText('boot: creating PIXI.Application')
    console.log('boot: creating PIXI.Application')
    const nextApp = new PIXI.Application()
    try {
        Console.writeText('boot: calling app.init')
        console.log('boot: calling app.init')
        const canvas = document.createElement('canvas')
        const webgpuSupported = await PIXI.isWebGPUSupported({
            powerPreference: 'high-performance',
        })
        Console.writeText(`boot: webgpu supported: ${webgpuSupported}`)
        console.log('boot: webgpu supported', webgpuSupported)

        let initOptions = {
            width: innerWidth,
            height: innerHeight,
            background: 0x262626,
            autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2),
            canvas,
        }

        if (webgpuSupported) {
            initOptions = {
                ...initOptions,
                preference: 'webgpu',
                powerPreference: 'high-performance',
            }
        } else {
            const contextOptions = {
                alpha: false,
                antialias: true,
                premultipliedAlpha: true,
                stencil: true,
                preserveDrawingBuffer: false,
                powerPreference: 'default',
            }
            const gl2 = canvas.getContext('webgl2', contextOptions)
            const gl = gl2 || canvas.getContext('webgl', contextOptions)
            Console.writeText(`boot: webgl context: ${gl ? 'ok' : 'null'}`)
            console.log('boot: webgl context', gl)
            if (!gl) {
                throw new Error('WebGL context creation failed')
            }
            initOptions = {
                ...initOptions,
                preferWebGLVersion: 2,
                preference: 'webgl',
                powerPreference: 'default',
                context: gl,
            }
        }

        const initPromise = nextApp.init(initOptions)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('PIXI init timeout after 5s')), 5000)
        })
        await Promise.race([initPromise, timeoutPromise])
        Console.writeText('boot: app.init completed')
        console.log('boot: app.init completed')
    } catch (err) {
        Console.writeText(`renderer init failed: ${err?.message ?? err}`)
        console.error('renderer init failed:', err)
        throw err
    }

    Console.writeText('boot: appending canvas')
    console.log('boot: appending canvas')
    nextApp.canvas.style.display = 'block'
    const gameEl = document.getElementById('game')
    Console.writeText(`boot: game element exists: ${!!gameEl}`)
    console.log(`boot: game element exists: ${!!gameEl}`)
    gameEl?.appendChild(nextApp.canvas)

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

    Console.writeText('boot: renderer init ok')
    console.log('boot: renderer init ok')
    return app
}

export const getApp = () => app
export const getRenderer = () => renderer
export const getStage = () => stage
