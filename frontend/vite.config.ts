import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL || './',
  plugins: [react()],
  worker: {
    format: 'es'
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react';
          return undefined;
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['./pkg/bist.js']
  },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@pkg': '/pkg'
    }
  }
})
