import { defineConfig } from 'vitest/config'

import { platformAliases } from './vitest.config'

export default defineConfig({
  resolve: { alias: platformAliases },
  test: {
    exclude: ['**/.next/**', '**/.turbo/**', '**/dist/**', '**/node_modules/**'],
    include: [
      'apps/**/*.contract.test.ts',
      'packages/**/*.contract.test.ts',
      'tests/**/*.contract.test.ts',
    ],
    passWithNoTests: false,
    restoreMocks: true,
  },
})
