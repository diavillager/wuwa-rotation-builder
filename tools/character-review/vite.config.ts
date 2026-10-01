import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { reviewApi } from './api'

const root = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
  root: path.join(root, 'tools/character-review'),
  plugins: [
    react(),
    {
      name: 'local-character-review',
      configureServer(server) {
        server.middlewares.use(reviewApi(root))
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    cors: false,
    fs: { strict: true, allow: [root] },
  },
  build: {
    outDir: path.join(root, 'dist/character-review'),
    emptyOutDir: true,
  },
})
