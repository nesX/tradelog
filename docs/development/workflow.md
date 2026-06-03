# Development Workflow

Cómo se trabaja día a día en este repo.

## Branching

- `main` es la rama de producción. Cada push a `main` dispara el [workflow de deploy](../operations/ci-cd.md) que actualiza la VPS.
- No hay convención estricta de feature branches. El historial reciente muestra mezcla de commits directos a `main` y trabajo en ramas locales fusionadas con `git merge` o equivalente.
- **Recomendación**: para cambios no triviales abrir branch `feature/<descripcion-corta>` o `fix/<problema>`, hacer PR si trabajás con alguien, sino merge directo después de probar.

## Convención de commits

Mirando los últimos commits (`git log --oneline -10`) el estilo es **descriptivo en español**, no Conventional Commits formal:

```
Filtros temporales en sección Pendientes de seguimiento
Fix: ImageViewer index out-of-bounds + quitar filtro MIME en inputs de imagen
Docs: planificación de features previos (referencias y section dividers)
Bloque trade_reference: insertar trades en notas como galería horizontal
Acciones flotantes del bloque en grilla 2x2
```

Prefijos opcionales que aparecen: `Fix:`, `Docs:`. Pero el grueso es solo título descriptivo en presente o sustantivo.

**Para mantener consistencia**:
- Una línea, ≤72 caracteres, en español.
- Prefijo opcional `Fix:` / `Docs:` / `Refactor:` cuando ayuda a clasificar.
- Si el commit toca un módulo claro, mencionarlo: "Notes: …", "Backtest: …".

## Pre-commit y hooks

- **No hay `husky` ni hooks configurados.** El lint hay que correrlo a mano.
- Tampoco hay GitHub Actions de PR (solo deploy). Cualquier validación de tests/lint debe correrse localmente antes de pushear.

## Ciclo de cambio típico

1. `git pull origin main`
2. Crear branch o trabajar sobre `main` según naturaleza del cambio.
3. Backend: `cd trading-journal/backend && npm run dev` (watch).
4. Frontend: `cd trading-journal/frontend && npm run dev`.
5. Cambios → probar manualmente en `http://localhost:5173`.
6. Lint:
   ```bash
   cd trading-journal/backend && npm run lint:fix && npm run format
   cd trading-journal/frontend && npm run lint:fix
   ```
7. Tests (si los hay para el área tocada):
   ```bash
   cd trading-journal/backend && npm test
   ```
8. Commit + push. El [workflow de deploy](../operations/ci-cd.md) hace el resto.

## Migraciones de base de datos

Las migraciones viven en `trading-journal/database/` y son archivos SQL secuenciales numerados (`001_*`, `002_*`, …, `023_*`).

- **No hay framework de migraciones** (no usamos Knex, node-pg-migrate, etc.). Los archivos se aplican manualmente en orden con `psql`.
- Para añadir una nueva migración:
  1. Nuevo archivo `database/0NN_descripcion_corta.sql` (continuar la numeración).
  2. Idempotencia: usar `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (Postgres 9.6+), etc.
  3. Aplicar en local (Docker): `sudo docker exec -i tradelog-db psql -U postgres -d trading_journal < database/0NN_mi_migracion.sql`.
  4. Aplicar en prod: ver [`operations/database-ops.md`](../operations/database-ops.md).

## Cómo añadir un endpoint nuevo

Patrón del backend (ver [`architecture/backend.md`](../architecture/backend.md)):

1. **Validator** en `src/validators/<dominio>.validator.js` — schema Joi.
2. **Repository** en `src/repositories/<dominio>.repository.js` — queries SQL parametrizadas.
3. **Service** en `src/services/<dominio>.service.js` — lógica de negocio, validaciones de dominio.
4. **Controller** en `src/controllers/<dominio>.controller.js` — parsea request, llama service, responde con `sendSuccess` / `sendError`.
5. **Route** en `src/routes/<dominio>.routes.js` — monta el controller con `validate(schema)` y `authenticate` middlewares.
6. Si el endpoint sube archivos: usar `uploadTradeImages` / `uploadTradeImage` + `handleMulterError` (`src/middleware/upload.js`).
7. Registrar en `src/server.js` con `app.use('/api/<dominio>', router)`.

## Cómo añadir una página/feature al frontend

1. **Endpoint** en `src/api/endpoints.js` — función que llama `apiClient.{get,post,...}`.
2. **Hook** en `src/hooks/use<Dominio>.js` — `useQuery` o `useMutation` con query keys consistentes (ver `tradeKeys` factory en `useTrades.js`).
3. **Componente** en `src/components/<dominio>/` o `src/pages/`.
4. **Ruta** en `src/App.jsx` — agregar `<Route path="/...">` envuelto en `<ProtectedRoute>` o `<AdminRoute>` según necesite.
5. Estilo: ver [`design-system.md`](design-system.md) y [`style-guide.md`](style-guide.md).

## Code review

No hay PRs automáticos de bot ni revisores asignados. La revisión es informal — leer el diff antes de mergear y validar el cambio localmente.

Si querés un review automatizado con Claude, usá `/code-review` en una sesión de Claude Code sobre el branch.
