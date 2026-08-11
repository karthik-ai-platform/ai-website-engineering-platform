import { defineConfig } from 'tsup'

export default defineConfig({
  clean: true,
  entry: ['./src/server.ts'],
  format: ['esm'],
  noExternal: [/^@platform\//u],
  platform: 'node',
  sourcemap: true,
  target: 'node22',
})
