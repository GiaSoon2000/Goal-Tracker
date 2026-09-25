import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const deny = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default ts.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules', 'eslint.config.js', 'scripts/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Bans reading the CURRENT wall-clock date (new Date() with no args) outside
      // domain/date.ts and hooks/useToday.ts — Date.now() for a millisecond
      // timestamp (createdAt/updatedAt/loggedAt) is unaffected and used everywhere.
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Use todayLocal()/useToday() from domain/date.ts — see EDGE-CASES.md EC-T04.' },
      ],
    },
  },

  // --- layering firewall (ARCHITECTURE.md §2) ---
  {
    files: ['src/domain/**/*.ts'],
    rules: deny([
      { group: ['react', 'react-dom', 'react-router*', 'dexie*'], message: 'domain/ must stay pure.' },
      { group: ['**/repo/**', '**/db/**', '**/ui/**', '**/screens/**', '**/hooks/**'], message: 'domain/ may not depend on outer layers.' },
    ]),
  },
  {
    files: ['src/db/**/*.ts'],
    rules: deny([{ group: ['react*', '**/repo/**', '**/ui/**', '**/screens/**', '**/hooks/**'], message: 'db/ is the innermost persistence layer.' }]),
  },
  {
    files: ['src/repo/**/*.ts'],
    rules: deny([{ group: ['react*', '**/ui/**', '**/screens/**', '**/hooks/**'], message: 'repo/ must not know about the UI.' }]),
  },
  {
    files: ['src/ui/**/*.tsx', 'src/ui/**/*.ts'],
    rules: deny([{ group: ['dexie*', '**/db/**', '**/repo/**', '**/hooks/**', '**/screens/**'], message: 'ui/ components are presentational: props in, events out.' }]),
  },
  {
    files: ['src/screens/**/*.tsx', 'src/app/**/*.tsx', 'src/hooks/**/*.ts'],
    rules: deny([{ group: ['dexie', 'dexie/*', '**/db/**'], message: 'Only repo/ may touch IndexedDB.' }]),
  },
  {
    files: ['src/domain/date.ts', 'src/hooks/useToday.ts', '**/*.test.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
);
