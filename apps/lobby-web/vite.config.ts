import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [react()],
  publicDir: '../web/public',
  resolve: {
    alias: {
      '@game': fileURLToPath(new URL('../web/src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
  },
});
