const FALLBACK_WS_URL = 'ws://localhost:3001/ws'
const FALLBACK_WSS_URL = 'wss://need-for-fun.duckdns.org/ws'
const FALLBACK_HTTP_URL = 'http://localhost:3001'
const FALLBACK_HTTPS_URL = 'https://need-for-fun.duckdns.org'

function toSecureWsUrl(url) {
    if (!url) return ''
    if (url.startsWith('wss://')) return url
    if (url.startsWith('ws://')) return `wss://${url.slice('ws://'.length)}`
    return url
}

function wsUrlToHttpBase(url) {
    if (!url) return ''

    try {
        const parsed = new URL(url)
        parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:'
        parsed.pathname = ''
        parsed.search = ''
        parsed.hash = ''
        return parsed.toString().replace(/\/$/, '')
    } catch {
        return ''
    }
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

export function getBackendHttpBaseUrl() {
    const isSecure = window.location.protocol === 'https:'
    const httpUrl = import.meta.env.VITE_BACKEND_HTTP_URL
    const httpsUrl = import.meta.env.VITE_BACKEND_HTTPS_URL
    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL
    const wssUrl = import.meta.env.VITE_BACKEND_WSS_URL

    if (isSecure) {
        return httpsUrl || wsUrlToHttpBase(wssUrl) || wsUrlToHttpBase(wsUrl) || FALLBACK_HTTPS_URL
    }

    return httpUrl || wsUrlToHttpBase(wsUrl) || FALLBACK_HTTP_URL
}
