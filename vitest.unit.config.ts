import { mergeConfig, defineConfig } from 'vitest/config'

import baseConfig from './vitest.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        '**/.next/**',
        '**/.turbo/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.contract.test.ts',
        '**/*.integration.test.ts',
      ],
      include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }),
)
