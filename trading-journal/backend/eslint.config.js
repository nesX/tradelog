import js from '@eslint/js';
import globals from 'globals';

/**
 * ESLint flat config para el backend (Node.js, ES Modules, JS puro).
 *
 * Objetivo: mantener verde el código existente sin reformateos masivos.
 * El estilo (Prettier) no se aplica aquí; solo reglas de correctness.
 */
export default [
  {
    ignores: ['node_modules/**', 'logs/**', 'uploads/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Permitir variables/args sin usar cuando llevan prefijo "_" (p.ej. next
      // en middlewares de Express que no lo utilizan).
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // Idioma "omitir columna" al destructurar filas de la BD
          // (p.ej. const { total_count, ...rest } = row).
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'off',
    },
  },
  {
    // Ficheros de test: exponer los globales de Jest.
    files: ['src/**/*.test.js', 'tests/**/*.js', '**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
