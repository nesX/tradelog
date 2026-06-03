# Coding Standards

## Lenguaje

- **JavaScript puro** (no TypeScript).
- **ES Modules** en todo el repo (`"type": "module"` en ambos `package.json`).
- Node 18+ requerido.

## Convenciones detectadas en el código

| Categoría | Convención |
|-----------|------------|
| Archivos de componentes React | PascalCase + `.jsx` (`TradeTable.jsx`, `ImageViewer.jsx`) |
| Archivos de hooks | camelCase prefijo `use*` + `.js` (`useTrades.js`) |
| Archivos de servicios/repositorios | `<dominio>.<capa>.js` (`trade.service.js`, `trade.repository.js`) |
| Validadores Joi | `<dominio>.validator.js` |
| Funciones exportadas | camelCase, en español o inglés según contexto (mezclado; mantener el patrón vecino) |
| Constantes globales | `UPPER_SNAKE_CASE` (`PAGINATION_DEFAULTS`, `ALLOWED_MIME_TYPES`) |
| Query keys de TanStack Query | factory pattern: `tradeKeys.list(filters)`, `tradeKeys.detail(id)` |

## Comentarios e idioma

- Comentarios y mensajes de error **en español** (consistente con el resto del código).
- JSDoc opcional pero usado en `database.js`, `errorHandler.js`, etc. para funciones públicas:
  ```js
  /**
   * Ejecuta una query en la base de datos
   * @param {string} text - Query SQL
   * @param {Array} params - Parámetros de la query
   * @returns {Promise<Object>} Resultado de la query
   */
  ```
- Evitar comentarios obvios. Solo documentar el "por qué", no el "qué".

## ESLint + Prettier

### Backend

```bash
cd trading-journal/backend
npm run lint        # solo reportar
npm run lint:fix    # arreglar lo que sea automático
npm run format      # Prettier sobre src/**/*.js
```

Configuración: ESLint 9 con flat config (no hay `.eslintrc.json` explícito; viene de las defaults de `eslint init`).

### Frontend

```bash
cd trading-journal/frontend
npm run lint
npm run lint:fix
```

ESLint 8 + `eslint-plugin-react` + `eslint-plugin-react-hooks`. No hay script de Prettier en el frontend, pero un Prettier global funciona.

## Reglas operativas (no formales, pero aplicadas)

- **Queries SQL siempre parametrizadas** (`$1`, `$2`, …) — nunca interpolar strings. El módulo `pg` lo facilita.
- **No tocar `process.env` directamente** fuera de `src/config/env.js`. Importar `config` desde ahí.
- **No tocar `localStorage` desde componentes** — encapsular en contexts (`AuthContext`, `ThemeContext`) o hooks.
- **Errores operacionales**: usar `AppError` / `NotFoundError` / `ValidationError` / `ConflictError` / `DatabaseError` desde `middleware/errorHandler.js`. El middleware central las captura.
- **Respuestas HTTP**: usar siempre `sendSuccess` / `sendError` / `sendValidationError` (`utils/response.js`). Forma uniforme: `{ success, data, message }` o `{ success: false, error: { message, code, details } }`.
- **No imprimir `console.log`** en backend — usar `logger` de Winston (`utils/logger.js`). En frontend está OK para debug puntual, pero limpiar antes de commitear.
- **Imágenes**: comprimir client-side antes de subir (ya lo hace `utils/imageCompression.js`). No subir originales pesados.

## Estilo de React

- Componentes funcionales y hooks. No hay clases.
- **TanStack Query** para todo el estado del servidor; React Context solo para auth y theme.
- `react-hook-form` para formularios complejos (CreateTrade, NoteEditor).
- Validación client-side opcional pero recomendada; siempre revalidar en el backend con Joi.
- Tailwind para estilos — ver [`design-system.md`](design-system.md) y [`style-guide.md`](style-guide.md). No CSS Modules ni styled-components.

## Cosas que no hacer

- ❌ Crear archivos `*.ts` o `*.tsx` — el proyecto es JS puro.
- ❌ Importar de `node_modules` con paths relativos (`../../../node_modules/...`).
- ❌ Mezclar `require` y `import`. Solo ESM.
- ❌ Devolver respuestas crudas con `res.send(data)` — usar siempre las helpers de `response.js`.
- ❌ Escribir lógica de negocio en controllers — eso va en services.
- ❌ Hacer queries SQL fuera de repositories.
- ❌ Persistir secretos en código o `.env.example` (usar placeholders).
