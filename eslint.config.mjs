import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: tseslint.configs.disableTypeChecked.rules,
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@octokit/*',
            '@anthropic-ai/*',
            '@google/generative-ai',
            '@platform/provider-framework/internal/*',
            '@vercel/*',
            'drizzle-orm',
            'fastify',
            'next',
            'next/*',
            'openai',
            'postgres',
          ],
        },
      ],
    },
  },
  {
    files: ['apps/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@anthropic-ai/*',
            '@google/generative-ai',
            '@platform/provider-framework/internal/*',
            'openai',
          ],
        },
      ],
    },
  },
  globalIgnores([
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/dist/**',
    '**/node_modules/**',
    'docs/product/SRS_EXTRACTED.md',
    'tmp/**',
  ]),
])
