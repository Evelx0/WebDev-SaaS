// ESLint v9 flat config for lead-panel.
// Keeps the rule set deliberately small — TypeScript already catches the
// majority of real bugs via `npm run typecheck`. ESLint's job here is to
// flag the things tsc cannot: unused expressions, accidental `var` usage,
// debugging leftovers, and obviously wrong patterns.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'generated-sites/**',
      'prisma/migrations/**',
      'client/dist/**',
      'server/dist/**',
      // The public landing site is a hand-written static bundle deployed by
      // Nginx, not part of the TypeScript app surface. Skip it entirely.
      'landing/**',
      // Plain JS files are not part of the TypeScript app surface.
      // In ESLint v9 flat config --ext is ignored, so explicitly exclude .js.
      '**/*.js',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  // The base config rejects unused eslint-disable directives, which produces
  // noise when files are simplified. Disable that report at the top level.
  { linterOptions: { reportUnusedDisableDirectives: false } },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Node + browser globals that appear in both surfaces.
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        globalThis: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Core JS — keep noise low, focus on real footguns.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-debugger': 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
      // Tolerate eslint-disable comments left for hot-reload globals etc.
      // (Re-enable later if directive hygiene becomes an issue.)

      // TypeScript-specific — prefer the typescript-eslint variants.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
];
