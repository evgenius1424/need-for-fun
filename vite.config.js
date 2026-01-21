import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 8080,
        open: true,
    },
})
