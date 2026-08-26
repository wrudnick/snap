import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `base` must match the GitHub Pages repo path. Override with BASE_PATH=/ for
// local production smoke-testing.
const base = process.env.BASE_PATH ?? '/snap/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // `stats-gl` (via drei) depends on an older three, so without this the app
    // loads two copies. Every `instanceof` check across the postprocessing
    // pipeline then fails silently and the composer renders black.
    dedupe: ['three'],
  },
  build: {
    target: 'es2022',
    // three is large and stable; splitting it keeps app-code rebuilds cheap for
    // returning players.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          return undefined
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
