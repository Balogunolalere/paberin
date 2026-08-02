import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const config = {
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/unit/setup.ts'],
    exclude: ['node_modules/**', 'admin-dev/**', '.next/**'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules/', '.next/'],
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'src') },
    ],
  },
} as any

export default defineConfig(config)