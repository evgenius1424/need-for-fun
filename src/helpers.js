import { Howl } from 'howler'

export const Constants = {
    BRICK_WIDTH: 32,
    BRICK_HEIGHT: 16,
    PLAYER_MAX_VELOCITY_X: 3,
}

export const WeaponId = {
    GAUNTLET: 0,
    MACHINE: 1,
    SHOTGUN: 2,
    GRENADE: 3,
    ROCKET: 4,
    RAIL: 5,
    PLASMA: 6,
    SHAFT: 7,
    BFG: 8,
}

export const WeaponConstants = {
    DAMAGE: {
        [WeaponId.GAUNTLET]: 35,
        [WeaponId.MACHINE]: 5,
        [WeaponId.SHOTGUN]: 7,
        [WeaponId.GRENADE]: 65,
        [WeaponId.ROCKET]: 100,
        [WeaponId.RAIL]: 75,
        [WeaponId.PLASMA]: 14,
        [WeaponId.SHAFT]: 3,
        [WeaponId.BFG]: 100,
    },
    FIRE_RATE: {
        [WeaponId.GAUNTLET]: 25,
        [WeaponId.MACHINE]: 5,
        [WeaponId.SHOTGUN]: 50,
        [WeaponId.GRENADE]: 45,
        [WeaponId.ROCKET]: 40,
        [WeaponId.RAIL]: 85,
        [WeaponId.PLASMA]: 5,
        [WeaponId.SHAFT]: 1,
        [WeaponId.BFG]: 100,
    },
    PROJECTILE_SPEED: {
        [WeaponId.ROCKET]: 6,
        [WeaponId.PLASMA]: 7,
        [WeaponId.BFG]: 7,
        [WeaponId.GRENADE]: 5,
    },
    AMMO_START: {
        [WeaponId.GAUNTLET]: -1,
        [WeaponId.MACHINE]: 100,
        [WeaponId.SHOTGUN]: 10,
        [WeaponId.GRENADE]: 5,
        [WeaponId.ROCKET]: 20,
        [WeaponId.RAIL]: 10,
        [WeaponId.PLASMA]: 30,
        [WeaponId.SHAFT]: 50,
        [WeaponId.BFG]: 10,
    },
    AMMO_PICKUP: {
        [WeaponId.MACHINE]: 50,
        [WeaponId.SHOTGUN]: 10,
        [WeaponId.GRENADE]: 5,
        [WeaponId.ROCKET]: 5,
        [WeaponId.RAIL]: 10,
        [WeaponId.PLASMA]: 30,
        [WeaponId.SHAFT]: 50,
        [WeaponId.BFG]: 10,
    },
    NAMES: [
        'Gauntlet',
        'Machinegun',
        'Shotgun',
        'Grenade',
        'Rocket',
        'Railgun',
        'Plasma',
        'Shaft',
        'BFG',
    ],
}

export const GameConstants = {
    MAX_HEALTH: 100,
    MAX_ARMOR: 200,
    MEGA_HEALTH: 200,
    ARMOR_ABSORPTION: 0.67,
    SELF_DAMAGE_REDUCTION: 0.5,
    QUAD_MULTIPLIER: 3,
    QUAD_DURATION: 900,
    GIB_THRESHOLD: -40,
    RESPAWN_TIME: 180,
}

export const Utils = {
    trunc: Math.trunc,
}

const AIM_SENSITIVITY_KEY = 'aimSensitivity'
const DEFAULT_AIM_SENSITIVITY = 0.005

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

export const Settings = {
    aimSensitivity: (() => {
        const stored = Number.parseFloat(localStorage.getItem(AIM_SENSITIVITY_KEY))
        if (Number.isFinite(stored)) {
            return clamp(stored, 0.005, 0.2)
        }
        return DEFAULT_AIM_SENSITIVITY
    })(),
    setAimSensitivity(value) {
        const nextValue = clamp(value, 0.005, 0.2)
        this.aimSensitivity = nextValue
        localStorage.setItem(AIM_SENSITIVITY_KEY, String(nextValue))
        return nextValue
    },
}

export const Input = {
    keyUp: false,
    keyDown: false,
    keyLeft: false,
    keyRight: false,
    mouseX: 0,
    mouseY: 0,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    mouseDown: false,
    pointerLocked: false,
    weaponSwitch: -1,
}

const KEY_MAP = {
    ArrowUp: 'keyUp',
    ArrowDown: 'keyDown',
    ArrowLeft: 'keyLeft',
    ArrowRight: 'keyRight',
    w: 'keyUp',
    s: 'keyDown',
    a: 'keyLeft',
    d: 'keyRight',
    W: 'keyUp',
    S: 'keyDown',
    A: 'keyLeft',
    D: 'keyRight',
}

function handleKey(e, pressed) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

    const prop = KEY_MAP[e.key]
    if (prop) {
        e.preventDefault()
        Input[prop] = pressed
        return
    }

    if (pressed && e.keyCode >= 49 && e.keyCode <= 57) {
        Input.weaponSwitch = e.keyCode - 49
        e.preventDefault()
    }
}

document.addEventListener('keydown', (e) => handleKey(e, true))
document.addEventListener('keyup', (e) => handleKey(e, false))

document.addEventListener('mousemove', (e) => {
    if (Input.pointerLocked) {
        Input.mouseDeltaX += e.movementX
        Input.mouseDeltaY += e.movementY
        return
    }
    Input.mouseX = e.clientX
    Input.mouseY = e.clientY
})

document.addEventListener('mousedown', (e) => {
    if (e.button === 0) Input.mouseDown = true
})

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) Input.mouseDown = false
})

document.getElementById('game')?.addEventListener('contextmenu', (e) => e.preventDefault())

document.addEventListener('pointerlockchange', () => {
    const canvas = document.querySelector('#game canvas')
    Input.pointerLocked = document.pointerLockElement === canvas
    Input.mouseDeltaX = 0
    Input.mouseDeltaY = 0
})

export const Console = (() => {
    const el = document.getElementById('console')
    const elContent = document.getElementById('console-content')
    const elInput = document.getElementById('console-input')
    let isOpen = false
    let html = elContent.innerHTML

    window.addEventListener(
        'keydown',
        (e) => {
            if (e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.keyCode === 192) {
                e.preventDefault()
                toggle()
            }
        },
        { capture: true },
    )

    elInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const text = elInput.value.trim()
        if (!text) return
        writeText(`> ${text}`)
        executeCommand(text)
        elInput.value = ''
    })

    function toggle() {
        isOpen = !isOpen
        el.classList.toggle('open', isOpen)
        if (isOpen) {
            elContent.scrollTop = elContent.scrollHeight
            elInput.focus()
        }
    }

    function executeCommand(text) {
        const [cmd, ...args] = text.split(' ')
        const commands = {
            help() {
                writeText('Available commands:')
                writeText('  help - show this message')
                writeText('  map <name> - load map')
                writeText('  sensitivity [value] - get/set mouse aim sensitivity')
                writeText('  clear - clear console')
            },
            map() {
                if (args[0]) {
                    location.href = `?mapfile=${args[0]}`
                } else {
                    writeText('Usage: map <mapname>')
                }
            },
            sensitivity() {
                if (!args[0]) {
                    writeText(`Sensitivity: ${Settings.aimSensitivity}`)
                    return
                }
                const nextValue = Number.parseFloat(args[0])
                if (!Number.isFinite(nextValue)) {
                    writeText('Usage: sensitivity <number>')
                    return
                }
                const storedValue = Settings.setAimSensitivity(nextValue)
                writeText(`Sensitivity set to ${storedValue}`)
            },
            clear() {
                html = ''
                elContent.innerHTML = ''
            },
        }
        if (commands[cmd]) {
            commands[cmd]()
        } else {
            writeText(`Unknown command: ${cmd}`)
        }
    }

    function escapeHtml(text) {
        return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    }

    function writeText(text) {
        html += `<br>${escapeHtml(text)}`
        if (html.length > 5000) html = html.slice(-5000)
        elContent.innerHTML = html
        elContent.scrollTop = elContent.scrollHeight
    }

    return { writeText }
})()

export const MapEditor = {
    show() {},
    setContent() {},
}

const DEFAULT_MODEL = 'sarge'
const modelSoundCache = new Map()

function getModelSounds(model) {
    const key = model || DEFAULT_MODEL
    if (modelSoundCache.has(key)) return modelSoundCache.get(key)

    const basePath = `/assets/nfk/models/${key}`
    const sounds = {
        jump: new Howl({ src: [`${basePath}/jump1.wav`] }),
        death: [
            new Howl({ src: [`${basePath}/death1.wav`] }),
            new Howl({ src: [`${basePath}/death2.wav`] }),
            new Howl({ src: [`${basePath}/death3.wav`] }),
        ],
        pain: {
            25: new Howl({ src: [`${basePath}/pain25_1.wav`] }),
            50: new Howl({ src: [`${basePath}/pain50_1.wav`] }),
            75: new Howl({ src: [`${basePath}/pain75_1.wav`] }),
            100: new Howl({ src: [`${basePath}/pain100_1.wav`] }),
        },
    }

    modelSoundCache.set(key, sounds)
    return sounds
}

function pickPainLevel(damage) {
    if (damage >= 100) return 100
    if (damage >= 75) return 75
    if (damage >= 50) return 50
    if (damage >= 25) return 25
    return null
}

function playRandom(sounds) {
    if (!sounds || sounds.length === 0) return
    const pick = sounds[Math.floor(Math.random() * sounds.length)]
    pick.play()
}

const jumpSound = new Howl({ src: ['/sounds/jump1.wav'] })
const machinegunSound = new Howl({ src: ['/sounds/machinegun.wav'], volume: 0.5 })
const shotgunSound = new Howl({ src: ['/sounds/shotgun.wav'], volume: 0.6 })
const grenadeSound = new Howl({ src: ['/sounds/grenade.wav'], volume: 0.6 })
const rocketSound = new Howl({ src: ['/sounds/rocket.wav'], volume: 0.6 })
const railgunSound = new Howl({ src: ['/sounds/railgun.wav'], volume: 0.6 })
const plasmaSound = new Howl({ src: ['/sounds/plasma.wav'], volume: 0.4 })
const shaftSound = new Howl({ src: ['/sounds/shaft.wav'], volume: 0.3 })
const bfgSound = new Howl({ src: ['/sounds/bfg.wav'], volume: 0.7 })
const rocketExplodeSound = new Howl({ src: ['/sounds/rocket_explode.wav'], volume: 0.7 })
const grenadeExplodeSound = new Howl({ src: ['/sounds/grenade_explode.wav'], volume: 0.7 })
const plasmaHitSound = new Howl({ src: ['/sounds/plasma_hit.wav'], volume: 0.4 })

export const Sound = {
    jump: (model) => {
        if (model) {
            getModelSounds(model).jump.play()
            return
        }
        jumpSound.play()
    },
    death: (model) => {
        playRandom(getModelSounds(model).death)
    },
    pain: (model, damage) => {
        const level = pickPainLevel(damage)
        if (!level) return
        getModelSounds(model).pain[level].play()
    },
    machinegun: () => machinegunSound.play(),
    shotgun: () => shotgunSound.play(),
    grenade: () => grenadeSound.play(),
    rocket: () => rocketSound.play(),
    railgun: () => railgunSound.play(),
    plasma: () => plasmaSound.play(),
    shaft: () => shaftSound.play(),
    bfg: () => bfgSound.play(),
    rocketExplode: () => rocketExplodeSound.play(),
    grenadeExplode: () => grenadeExplodeSound.play(),
    plasmaHit: () => plasmaHitSound.play(),
}
