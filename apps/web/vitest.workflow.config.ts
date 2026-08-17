import { workflow } from '@workflow/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [workflow()],
  test: { include: ['src/**/*.workflow.test.ts'], testTimeout: 60_000 },
})
