import { defineConfig } from 'vitest/config'

import { platformAliases } from './vitest.config'

export default defineConfig({
  resolve: { alias: platformAliases },
  test: {
    exclude: ['**/.next/**', '**/.turbo/**', '**/dist/**', '**/node_modules/**'],
    fileParallelism: false,
    hookTimeout: 20_000,
    include: [
      'apps/**/*.integration.test.ts',
      'packages/**/*.integration.test.ts',
      'tests/**/*.integration.test.ts',
    ],
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 20_000,
  },
})
