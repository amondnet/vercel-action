import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__integration__/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/__tests__/**/*.test.ts'],
          exclude: ['node_modules', 'dist', 'example'],
          testTimeout: 10000,
          hookTimeout: 10000,
          // Prevent index.ts from auto-invoking run() when tests import it.
          // The guard uses GITHUB_ACTIONS === 'true', which is set to 'true'
          // in the CI runner environment where unit tests also run.
          env: { GITHUB_ACTIONS: '' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/__integration__/**/*.test.ts'],
          exclude: ['node_modules', 'dist', 'example'],
          globalSetup: ['src/__integration__/global-setup.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
})
