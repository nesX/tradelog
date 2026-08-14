/**
 * Setup global de Jest.
 *
 * Fija variables de entorno mínimas ANTES de que se importe `config/env.js`
 * (que las valida con Joi y lanza si faltan). Así los tests unitarios no
 * dependen de un fichero `.env` real ni de la base de datos.
 *
 * `dotenv.config()` en env.js no sobrescribe valores ya presentes en
 * process.env, por lo que estos defaults mandan durante los tests.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'trading_journal_test';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
