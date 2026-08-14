/**
 * Configuración de Jest para el backend.
 *
 * El proyecto es ESM puro ("type": "module"), por eso:
 *   - `transform: {}` desactiva Babel (Node ejecuta los módulos nativamente).
 *   - el script `npm test` arranca Jest con `--experimental-vm-modules`.
 *
 * Los tests viven en `src/**\/__tests__/*.test.js` y NO tocan BD ni servidor:
 * los repositorios se mockean con `jest.unstable_mockModule`.
 */
export default {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  clearMocks: true,
  verbose: true,
};
