const FALLBACK_WS_URL = 'ws://localhost:3001/ws'
const FALLBACK_WSS_URL = 'wss://need-for-fun.duckdns.org/ws'

function toSecureWsUrl(url) {
    if (!url) return ''
    if (url.startsWith('wss://')) return url
    if (url.startsWith('ws://')) return `wss://${url.slice('ws://'.length)}`
    return url
}

export function getBackendWsUrl() {
    const isSecure = window.location.protocol === 'https:'
    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL
    const wssUrl = import.meta.env.VITE_BACKEND_WSS_URL

    if (isSecure) {
        return wssUrl || toSecureWsUrl(wsUrl) || FALLBACK_WSS_URL
    }

    return wsUrl || FALLBACK_WS_URL
}
