import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noHelperFunctions from './eslint-rules/no-helper-functions.ts';

const tsFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
const jsFiles = ['**/*.js', '**/*.cjs', '**/*.mjs'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'beta/dist/**',
      'vscode-extension/out/**',
      'vscode-extension/node_modules/**',
      'beta/vscode-extension/out/**',
      'beta/vscode-extension/node_modules/**',
      'beta/vscode-extension/preview/public/**',
      'beta/vscode-extension/preview/node_modules/**',
      '**/*.d.ts',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: jsFiles,
    rules: {
      ...js.configs.recommended.rules,
      'no-control-regex': 'off',
    },
  },
  {
    files: tsFiles,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    plugins: {
      'custom': {
        rules: {
          'no-helper-functions': noHelperFunctions,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^ignored' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-control-regex': 'off',
      'custom/no-helper-functions': 'warn',
    },
  }
);
