import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.local/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/generated/**',
    '**/next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  ...tseslint.configs.recommended,
  ...next.map((config) => ({
    ...config,
    settings: { ...config.settings, next: { rootDir: 'apps/web' } },
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
  })),
]);
