import { defineConfig } from 'vite'

export default defineConfig({
    root: 'apps/web',
    publicDir: 'public',
    build: {
        outDir: '../../dist/web',
        emptyOutDir: true,
    },
    server: {
        port: 8080,
        open: true,
    },
})
