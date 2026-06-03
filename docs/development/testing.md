# Testing

## Estado actual

- **Backend**: infraestructura lista con Jest 29 + ESM (`--experimental-vm-modules`), pero la cobertura real es **mínima**. La carpeta `trading-journal/backend/tests/` existe pero está prácticamente vacía.
- **Frontend**: **no hay tests configurados**. No hay Vitest, no hay Jest, no hay Testing Library en `package.json`.

Esto es un riesgo a medida que la app se acerca a publicación. Ver el plan en [`../analysis/scaling.md`](../analysis/scaling.md#fase-0--hardening-pre-publicación).

## Backend — cómo correr

```bash
cd trading-journal/backend
npm test
```

Internamente ejecuta:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

ESM puro: nada de `require()`, solo `import`. Para mocks Jest en ESM ver https://jestjs.io/docs/ecmascript-modules.

## Cómo añadir un test (backend)

Convención: `<archivo>.test.js` junto a (o paralelo a) el archivo testeado.

### Test de servicio (sin DB)

```js
// trading-journal/backend/tests/services/csvParser.test.js
import { jest } from '@jest/globals';
import { parseCsvText } from '../../src/services/csvParser.service.js';

describe('csvParser', () => {
  test('parsea una línea válida', () => {
    const csv = 'fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas\n'
              + '2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout';
    const result = parseCsvText(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].symbol).toBe('BTCUSDT');
  });
});
```

### Test de repository (necesita DB)

Levantar el contenedor `tradelog-db` antes. Usar transacciones con rollback para no ensuciar:

```js
import { getClient } from '../../src/config/database.js';
import { listTrades } from '../../src/repositories/trade.repository.js';

let client;
beforeEach(async () => {
  client = await getClient();
  await client.query('BEGIN');
});
afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

test('listTrades respeta el filtro de user_id', async () => {
  // insertar fixtures con client.query(...)
  // ejecutar repo
  // assert
});
```

> **Pendiente** (ver [`pending-decisions.md`](../pending-decisions.md)): definir si los repositories deben aceptar un `client` opcional para soportar tests transaccionales. Hoy usan el `pool` global directamente.

## Qué priorizar cuando se escriban tests

En orden de retorno por esfuerzo:

1. **`csvParser.service.js`** — parsing puro sin DB, alto riesgo de regresiones, fácil de testear.
2. **Validators Joi** — son schemas, son funciones puras, valen 5 minutos cada uno.
3. **`stats.service.js`** — queries de agregación con `FILTER`/`GROUP BY`. Si rompés una, el dashboard miente sin error visible. Tests de regresión con fixtures.
4. **`trade.service.js`** + `trade.repository.js` — CRUD core.
5. **`auth.service.js`** — JWT issue/verify, Google token validation.
6. **`note.service.js`** + `fractional-indexing` — la lógica de drag-and-drop es la más sutil del proyecto.

## Tests del frontend

No hay configuración. Cuando se añada, la recomendación es:

- **Vitest** (integra naturalmente con Vite).
- **@testing-library/react** para componentes.
- Mock de TanStack Query con un `QueryClient` por test.
- Mock de axios con `msw` (Mock Service Worker) — permite tests realistas sin tocar red.

Esto se documentará cuando se introduzca. Mientras tanto, **la validación es manual en el navegador**.

## CI

El workflow de GitHub Actions ([`../operations/ci-cd.md`](../operations/ci-cd.md)) **no corre tests** — solo despliega. Si querés bloquear merges con tests rojos, hay que añadir un job de CI separado. Ver [`pending-decisions.md`](../pending-decisions.md) `D-011`.
