import { Howl } from 'howler'
import { DEFAULT_MODEL, getSoundPaths } from './models'

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

export const Constants = {
    BRICK_WIDTH: 32,
    BRICK_HEIGHT: 16,
    PLAYER_MAX_VELOCITY_X: 3,
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

export const WeaponConstants = {
    DAMAGE: weaponMap(35, 5, 7, 65, 100, 75, 14, 3, 100),
    FIRE_RATE: weaponMap(25, 5, 50, 45, 40, 85, 5, 1, 100),
    AMMO_START: weaponMap(-1, 100, 10, 5, 20, 10, 30, 50, 10),
    AMMO_PICKUP: weaponMap(-1, 50, 10, 5, 5, 10, 30, 50, 10),
    PROJECTILE_SPEED: {
        [WeaponId.ROCKET]: 6,
        [WeaponId.PLASMA]: 7,
        [WeaponId.BFG]: 7,
        [WeaponId.GRENADE]: 5,
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

export const Utils = { trunc: Math.trunc }

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
    weaponScroll: 0,
}

export const Settings = createSettings()

export const Console = createConsole()

export const MapEditor = { show() {}, setContent() {} }

export const Sound = createSoundSystem()

initInputHandlers()

function weaponMap(gauntlet, machine, shotgun, grenade, rocket, rail, plasma, shaft, bfg) {
    return {
        [WeaponId.GAUNTLET]: gauntlet,
        [WeaponId.MACHINE]: machine,
        [WeaponId.SHOTGUN]: shotgun,
        [WeaponId.GRENADE]: grenade,
        [WeaponId.ROCKET]: rocket,
        [WeaponId.RAIL]: rail,
        [WeaponId.PLASMA]: plasma,
        [WeaponId.SHAFT]: shaft,
        [WeaponId.BFG]: bfg,
    }
}

function createSettings() {
    const KEY = 'aimSensitivity'
    const DEFAULT = 0.005
    const MIN = 0.005
    const MAX = 0.2

    const clamp = (v) => Math.max(MIN, Math.min(MAX, v))

    const stored = Number.parseFloat(localStorage.getItem(KEY))
    const initial = Number.isFinite(stored) ? clamp(stored) : DEFAULT

    return {
        aimSensitivity: initial,
        setAimSensitivity(value) {
            this.aimSensitivity = clamp(value)
            localStorage.setItem(KEY, String(this.aimSensitivity))
            return this.aimSensitivity
        },
    }
}

function initInputHandlers() {
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

    const handleKey = (e, pressed) => {
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
        } else {
            Input.mouseX = e.clientX
            Input.mouseY = e.clientY
        }
    })

    document.addEventListener('mousedown', (e) => {
        if (e.button === 0) Input.mouseDown = true
    })
    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) Input.mouseDown = false
    })

    const gameRoot = document.getElementById('game')
    gameRoot?.addEventListener('contextmenu', (e) => e.preventDefault())
    gameRoot?.addEventListener(
        'wheel',
        (e) => {
            Input.weaponScroll += e.deltaY
            e.preventDefault()
        },
        { passive: false },
    )

    document.addEventListener('pointerlockchange', () => {
        const canvas = document.querySelector('#game canvas')
        Input.pointerLocked = document.pointerLockElement === canvas
        Input.mouseDeltaX = 0
        Input.mouseDeltaY = 0
    })
}

function createConsole() {
    const el = document.getElementById('console')
    const elContent = document.getElementById('console-content')
    const elInput = document.getElementById('console-input')
    let isOpen = false
    let html = elContent?.innerHTML ?? ''

    const escapeHtml = (text) =>
        text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

    const writeText = (text) => {
        html += `<br>${escapeHtml(text)}`
        if (html.length > 5000) html = html.slice(-5000)
        if (elContent) {
            elContent.innerHTML = html
            elContent.scrollTop = elContent.scrollHeight
        }
    }

    const toggle = () => {
        isOpen = !isOpen
        el?.classList.toggle('open', isOpen)
        if (isOpen && elContent && elInput) {
            elContent.scrollTop = elContent.scrollHeight
            elInput.focus()
        } else if (elInput) {
            elInput.blur()
        }
    }

    const commands = {}
    const commandHelp = new Map()
    const addCommand = (name, handler, helpText) => {
        commands[name] = handler
        if (helpText) commandHelp.set(name, helpText)
    }

    addCommand(
        'help',
        () => {
            writeText('Available commands:')
            for (const [name, text] of [...commandHelp.entries()].sort((a, b) =>
                a[0].localeCompare(b[0]),
            )) {
                writeText(`  ${name} - ${text}`)
            }
        },
        'show this message',
    )
    addCommand(
        'map',
        (args) => {
            if (args[0]) location.href = `?mapfile=${args[0]}`
            else writeText('Usage: map <mapname>')
        },
        'load map',
    )
    addCommand(
        'sensitivity',
        (args) => {
            if (!args[0]) {
                writeText(`Sensitivity: ${Settings.aimSensitivity}`)
                return
            }
            const val = Number.parseFloat(args[0])
            if (!Number.isFinite(val)) {
                writeText('Usage: sensitivity <number>')
                return
            }
            writeText(`Sensitivity set to ${Settings.setAimSensitivity(val)}`)
        },
        'get/set mouse aim sensitivity',
    )
    addCommand(
        'clear',
        () => {
            html = ''
            if (elContent) elContent.innerHTML = ''
        },
        'clear console',
    )

    const execute = (text) => {
        const [cmd, ...args] = text.split(' ')
        if (commands[cmd]) commands[cmd](args)
        else writeText(`Unknown command: ${cmd}`)
    }

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

    elInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const text = elInput.value.trim()
        if (!text) return
        writeText(`> ${text}`)
        execute(text)
        elInput.value = ''
    })

    return {
        writeText,
        registerCommand(name, handler, helpText) {
            if (!name || typeof handler !== 'function') return
            addCommand(name, handler, helpText)
        },
    }
}

function createSoundSystem() {
    const modelCache = new Map()
    let unlocked = false
    let weapons = null
    let defaultJump = null

    const howl = (src, volume = 1) => new Howl({ src: [src], volume })

    const isUnlocked = () => unlocked

    const init = () => {
        if (unlocked) return
        weapons = {
            machinegun: howl('/sounds/machinegun.wav', 0.5),
            shotgun: howl('/sounds/shotgun.wav', 0.6),
            grenade: howl('/sounds/grenade.wav', 0.6),
            rocket: howl('/sounds/rocket.wav', 0.6),
            railgun: howl('/sounds/railgun.wav', 0.6),
            plasma: howl('/sounds/plasma.wav', 0.4),
            shaft: howl('/sounds/shaft.wav', 0.3),
            bfg: howl('/sounds/bfg.wav', 0.7),
            rocketExplode: howl('/sounds/rocket_explode.wav', 0.7),
            grenadeExplode: howl('/sounds/grenade_explode.wav', 0.7),
            plasmaHit: howl('/sounds/plasma_hit.wav', 0.4),
        }

        defaultJump = howl('/sounds/jump1.wav')
        unlocked = true
    }

    const getModelSounds = (model) => {
        if (!isUnlocked()) return null
        const key = model || DEFAULT_MODEL
        if (modelCache.has(key)) return modelCache.get(key)

        const paths = getSoundPaths(key)
        const sounds = {
            jump: howl(paths.jump),
            death: paths.death.map((p) => howl(p)),
            pain: {
                25: howl(paths.pain[25]),
                50: howl(paths.pain[50]),
                75: howl(paths.pain[75]),
                100: howl(paths.pain[100]),
            },
        }
        modelCache.set(key, sounds)
        return sounds
    }

    const pickPainLevel = (damage) => {
        if (damage >= 100) return 100
        if (damage >= 75) return 75
        if (damage >= 50) return 50
        if (damage >= 25) return 25
        return null
    }

    const playRandom = (arr) => arr?.[Math.floor(Math.random() * arr.length)]?.play()

    return {
        unlock: () => init(),
        jump: (model) => {
            if (!isUnlocked()) return
            const sounds = model ? getModelSounds(model) : { jump: defaultJump }
            sounds?.jump?.play()
        },
        death: (model) => {
            if (!isUnlocked()) return
            const sounds = getModelSounds(model)
            if (sounds) playRandom(sounds.death)
        },
        pain: (model, damage) => {
            if (!isUnlocked()) return
            const lvl = pickPainLevel(damage)
            if (lvl) getModelSounds(model)?.pain?.[lvl]?.play()
        },
        machinegun: () => isUnlocked() && weapons?.machinegun.play(),
        shotgun: () => isUnlocked() && weapons?.shotgun.play(),
        grenade: () => isUnlocked() && weapons?.grenade.play(),
        rocket: () => isUnlocked() && weapons?.rocket.play(),
        railgun: () => isUnlocked() && weapons?.railgun.play(),
        plasma: () => isUnlocked() && weapons?.plasma.play(),
        shaft: () => isUnlocked() && weapons?.shaft.play(),
        bfg: () => isUnlocked() && weapons?.bfg.play(),
        rocketExplode: () => isUnlocked() && weapons?.rocketExplode.play(),
        grenadeExplode: () => isUnlocked() && weapons?.grenadeExplode.play(),
        plasmaHit: () => isUnlocked() && weapons?.plasmaHit.play(),
    }
}
