export const ModelId = {
    SARGE: 'sarge',
}

export const SkinId = {
    BLUE: 'b',
    RED: 'r',
    WHITE: 'white',
    DARK: 'dk',
    BROWN: 'bn',
    NUKER: 'nuker',
}

const MODEL_CONFIGS = {
    [ModelId.SARGE]: {
        name: 'Sarge',
        basePath: '/assets/nfk/models/sarge',
        animations: {
            walk: { frames: 18, width: 45, height: 48 },
            crouch: { frames: 10, width: 50, height: 40 },
            die: { frames: 30, width: 45, height: 48 },
        },
        skins: [SkinId.BLUE, SkinId.RED, SkinId.WHITE, SkinId.DARK, SkinId.BROWN, SkinId.NUKER],
        defaultSkin: SkinId.BLUE,
        sounds: {
            jump: 'jump1.wav',
            death: ['death1.wav', 'death2.wav', 'death3.wav'],
            pain: {
                25: 'pain25_1.wav',
                50: 'pain50_1.wav',
                75: 'pain75_1.wav',
                100: 'pain100_1.wav',
            },
        },
    },
}

export const DEFAULT_MODEL = ModelId.SARGE
export const DEFAULT_SKIN = SkinId.BLUE

export function getModelSkinKey(modelId, skinId) {
    return `${modelId}:${skinId}`
}

function getModelConfig(modelId) {
    return MODEL_CONFIGS[modelId] || MODEL_CONFIGS[DEFAULT_MODEL]
}

export function getAnimationConfig(modelId) {
    return getModelConfig(modelId).animations
}

export function getAnimationFile(modelId, animType, skinId) {
    const config = getModelConfig(modelId)
    const skin = config.skins.includes(skinId) ? skinId : config.defaultSkin
    const prefix = animType[0] // 'w' for walk, 'c' for crouch, 'd' for die
    return `${config.basePath}/${prefix}${skin}.png`
}

export function getSoundPaths(modelId) {
    const config = getModelConfig(modelId)
    const base = config.basePath
    const s = config.sounds
    return {
        jump: `${base}/${s.jump}`,
        death: s.death.map((f) => `${base}/${f}`),
        pain: {
            25: `${base}/${s.pain[25]}`,
            50: `${base}/${s.pain[50]}`,
            75: `${base}/${s.pain[75]}`,
            100: `${base}/${s.pain[100]}`,
        },
    }
}
