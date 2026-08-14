import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint flat config para el frontend (React + Vite, JSX, hooks, browser).
 *
 * ESLint 8.57 usa este archivo porque el script de lint activa
 * ESLINT_USE_FLAT_CONFIG=true. Objetivo: verde sobre el código actual sin
 * reformateos; solo reglas de correctness. Prettier no se aplica aquí.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'dev-dist/**'],
  },
  js.configs.recommended,
  react.configs.flat.recommended,
  // JSX transform automático (React 17+/Vite): no exige React en scope.
  react.configs.flat['jsx-runtime'],
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // El proyecto no usa PropTypes: evita cientos de falsos positivos.
      'react/prop-types': 'off',
      // Comillas/apóstrofes literales en texto JSX: regla puramente
      // estilística, no aporta correctness. Se desactiva para no reescribir
      // textos en español.
      'react/no-unescaped-entities': 'off',
      // Permitir catch vacío (guardas de localStorage que no deben romper la UI).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Variables sin usar: error, salvo prefijo "_".
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'off',
    },
  },
];
