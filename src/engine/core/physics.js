import { Console, Constants, Sound, Utils } from '../../helpers'
import { Map } from '../../map'

const { BRICK_WIDTH, BRICK_HEIGHT, PLAYER_MAX_VELOCITY_X } = Constants
const { trunc } = Utils
const { isBrick } = Map

const FRAME_MS = 16
const MAX_TICKS_PER_FRAME = 5

const SPEED_JUMP_Y = [0, 0, 0.4, 0.8, 1.0, 1.2, 1.4]
const SPEED_JUMP_X = [0, 0.33, 0.8, 1.1, 1.4, 1.8, 2.2]

const physics = {
    time: 0,
    alpha: 1,
    lastKeyUp: false,
    lastWasJump: false,
    speedJumpDir: 0,
    logLine: 0,
    lastLogTime: 0,
}

export const Physics = {
    updateAllPlayers(players, timestamp) {
        if (physics.time === 0) physics.time = timestamp - FRAME_MS

        const delta = timestamp - physics.time
        let frames = trunc(delta / FRAME_MS)
        if (frames === 0) {
            physics.alpha = delta / FRAME_MS
            return false
        }

        if (frames > MAX_TICKS_PER_FRAME) {
            frames = MAX_TICKS_PER_FRAME
            physics.time = timestamp - frames * FRAME_MS
        }

        physics.time += frames * FRAME_MS

        // Apply same number of physics frames to ALL players
        while (frames-- > 0) {
            for (const player of players) {
                player.prevX = player.x
                player.prevY = player.y
                if (!player.dead) playerMove(player)
            }
        }
        physics.alpha = (timestamp - physics.time) / FRAME_MS
        return true
    },
    stepPlayers(players, frames = 1) {
        let remaining = Math.max(0, frames | 0)
        while (remaining-- > 0) {
            for (const player of players) {
                player.prevX = player.x
                player.prevY = player.y
                if (!player.dead) playerMove(player)
            }
        }
    },
    getAlpha() {
        return physics.alpha
    },
}

function playerMove(player) {
    applyPhysics(player)

    if (player.doublejumpCountdown > 0) player.doublejumpCountdown--
    if (player.isOnGround()) player.velocityY = 0

    handleJump(player)
    handleCrouch(player)
    handleHorizontalMovement(player)
}

function applyPhysics(player) {
    const startX = player.x
    const startY = player.y

    player.velocityY += 0.056
    if (player.velocityY > -1 && player.velocityY < 0) player.velocityY /= 1.11
    if (player.velocityY > 0 && player.velocityY < 5) player.velocityY *= 1.1

    if (Math.abs(player.velocityX) > 0.2) {
        if (player.keyLeft === player.keyRight) {
            player.velocityX /= player.isOnGround() ? 1.14 : 1.025
        }
    } else {
        player.velocityX = 0
    }

    const speedX = getSpeedX(player)
    player.setXY(player.x + player.velocityX + speedX, player.y + player.velocityY)

    if (player.crouch) {
        if (player.isOnGround() && (player.isBrickCrouchOnHead() || player.velocityY > 0)) {
            player.velocityY = 0
            player.setY(
                trunc(Math.round(player.y) / BRICK_HEIGHT) * BRICK_HEIGHT + BRICK_HEIGHT / 2,
            )
        } else if (player.isBrickCrouchOnHead() && player.velocityY < 0) {
            player.velocityY = 0
            player.doublejumpCountdown = 3
            player.setY(
                trunc(Math.round(player.y) / BRICK_HEIGHT) * BRICK_HEIGHT + BRICK_HEIGHT / 2,
            )
        }
    }

    if (player.velocityX !== 0) {
        const col = trunc(Math.round(startX + (player.velocityX < 0 ? -11 : 11)) / BRICK_WIDTH)
        const checkY = player.crouch ? player.y : startY
        const headOff = player.crouch ? 8 : 16

        if (
            isBrick(col, trunc(Math.round(checkY - headOff) / BRICK_HEIGHT)) ||
            isBrick(col, trunc(Math.round(checkY) / BRICK_HEIGHT)) ||
            isBrick(col, trunc(Math.round(checkY + BRICK_HEIGHT) / BRICK_HEIGHT))
        ) {
            player.setX(trunc(startX / BRICK_WIDTH) * BRICK_WIDTH + (player.velocityX < 0 ? 9 : 22))
            player.velocityX = 0
            player.speedJump = 0
            if (startX !== player.x) logPhysics('wall', player)
        }
    }

    if (player.isOnGround() && (player.isBrickOnHead() || player.velocityY > 0)) {
        player.velocityY = 0
        player.setY(trunc(Math.round(player.y) / BRICK_HEIGHT) * BRICK_HEIGHT + BRICK_HEIGHT / 2)
    } else if (player.isBrickOnHead() && player.velocityY < 0) {
        player.velocityY = 0
        player.doublejumpCountdown = 3
    }

    player.velocityX = clamp(player.velocityX, -5, 5)
    player.velocityY = clamp(player.velocityY, -5, 5)
}

function handleJump(player) {
    const keysChanged =
        player.keyUp !== physics.lastKeyUp ||
        (player.keyLeft && physics.speedJumpDir !== -1) ||
        (player.keyRight && physics.speedJumpDir !== 1)

    if (player.speedJump > 0 && keysChanged) {
        player.speedJump = 0
        logPhysics('sj 0 - change keys', player)
    }

    physics.lastKeyUp = player.keyUp
    let jumped = false

    if (player.keyUp && player.isOnGround() && !player.isBrickOnHead() && !physics.lastWasJump) {
        const isDoubleJump = player.doublejumpCountdown > 4 && player.doublejumpCountdown < 11

        if (isDoubleJump) {
            player.doublejumpCountdown = 14
            player.velocityY = -3

            const totalSpeedX =
                player.velocityX !== 0
                    ? Math.abs(player.velocityX) + SPEED_JUMP_X[player.speedJump]
                    : 0

            if (totalSpeedX > 3) {
                const bonus = totalSpeedX - 3
                player.velocityY -= bonus
                logPhysics(`dj higher (bonus +${formatNum(bonus)})`, player)
            } else {
                logPhysics('dj standard', player)
            }
            player.crouch = false
            Sound.jump(player.model)
        } else {
            if (player.doublejumpCountdown === 0) {
                player.doublejumpCountdown = 14
                Sound.jump(player.model)
            }
            player.velocityY = -2.9 + SPEED_JUMP_Y[player.speedJump]
            logPhysics('jump', player)

            if (
                player.speedJump < 6 &&
                !physics.lastWasJump &&
                player.keyLeft !== player.keyRight
            ) {
                physics.speedJumpDir = player.keyLeft ? -1 : 1
                player.speedJump++
                logPhysics('increase sj', player)
            }
        }
        jumped = true
    } else if (player.isOnGround() && player.speedJump > 0 && !player.keyDown) {
        player.speedJump = 0
        logPhysics('sj 0 - on ground', player)
    }

    physics.lastWasJump = jumped
}

function handleCrouch(player) {
    if (!player.keyUp && player.keyDown) {
        player.crouch = player.isOnGround() || player.isBrickCrouchOnHead()
    } else {
        player.crouch = player.isOnGround() && player.isBrickCrouchOnHead()
    }
}

function handleHorizontalMovement(player) {
    if (player.keyLeft === player.keyRight) return

    let maxVel = PLAYER_MAX_VELOCITY_X
    if (player.crouch) maxVel--

    const sign = player.keyLeft ? -1 : 1
    if (player.velocityX * sign < 0) player.velocityX += sign * 0.8

    const absVel = Math.abs(player.velocityX)
    if (absVel < maxVel) {
        player.velocityX += sign * 0.35
    } else if (absVel > maxVel) {
        player.velocityX = sign * maxVel
    }
}

function getSpeedX(player) {
    return player.velocityX !== 0 ? Math.sign(player.velocityX) * SPEED_JUMP_X[player.speedJump] : 0
}

function logPhysics(text, player) {
    const now = performance.now()
    if (now - physics.lastLogTime < 50) return
    physics.lastLogTime = now
    physics.logLine++

    const dx = getSpeedX(player)
    Console.writeText(
        `${physics.logLine} ${text} (x:${formatNum(player.x)} y:${formatNum(player.y)} ` +
            `dx:${formatNum(dx)} dy:${formatNum(player.velocityY)} sj:${player.speedJump})`,
    )
}

function formatNum(val) {
    const i = trunc(val)
    return `${i}.${Math.abs(trunc(val * 10) - i * 10)}`
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val
}
