# Bug: condiciones de carrera en moves/reorder y CTE sin guard de ciclos
2026-08-05 · **Severidad: MEDIA (baja probabilidad, impacto alto)** · Backend

Todos los flujos de mover/reordenar hacen read-then-write sin transacción ni
locks. Con un solo usuario y dos tabs es improbable pero posible; el impacto de
un ciclo en el árbol es grave (ver punto 2).

## 1. `moveDnd` concurrente puede crear un ciclo en el árbol
`backend/src/services/note.service.js:139-142`: la validación anti-ciclos
(`getDescendantIds`) corre fuera de transacción. Dos requests simultáneos
"mover A dentro de B" y "mover B dentro de A" pasan ambos la validación → ciclo
persistente `A→B→A`.

## 2. Los CTE recursivos no tienen protección de ciclos
`note.repository.js:112-124` (softDelete), `:178-192` (getDescendantIds,
isDescendant): `WITH RECURSIVE ... UNION ALL` sin guard. Si existe un ciclo
(punto 1), la siguiente query recursiva entra en recursión infinita
(query colgada / OOM).

## 3. Claves fractional duplicadas por carrera read-then-write
`note.service.js:156-176` + `note.repository.js:84-99,231-261`: dos tabs
moviendo/creando sobre los mismos hermanos leen las mismas posiciones vecinas y
`generateKeyBetween` genera la misma clave → orden no determinista. La
salvaguarda anti-duplicados existe solo en `createBlock`
(`note.repository.js:391-393`), no en `moveDnd`, `moveBlockDnd` ni `create`.

## 4. Reorder parcial corrompe posiciones
`note.repository.js:147-167` (reorderSiblings) y `:442-462` (reorderBlocks):
el service valida que los ids sean hermanos pero NO que la lista incluya a
TODOS los hermanos. Un reorder parcial reasigna desde `'a0','a1',...` y puede
colisionar con las posiciones de los omitidos.

## Fix
- Envolver validación + UPDATE de `moveDnd`/`moveBlockDnd`/`create` en una
  transacción con `SELECT ... FOR UPDATE` de las filas implicadas, o un
  advisory lock por usuario (`pg_advisory_xact_lock(user_id)`) — más simple y
  suficiente para esta escala.
- Añadir guard a los CTE: `UNION` en vez de `UNION ALL` + cap de profundidad
  (columna depth < 50), o cláusula `CYCLE` (PG 14+).
- En reorder: comparar la lista recibida contra `SELECT id FROM ... FOR UPDATE`
  dentro de la transacción y rechazar si no es el conjunto completo.

## Relacionados menores (mismo ámbito)
- `moveNote` legacy (`PATCH /:id/move`, `note.repository.js:139-145`) cambia el
  padre sin recalcular `position` y es redundante con `move-dnd` → retirar o
  arreglar.
- `addTradeToBlock` (`note.repository.js:564-579`): `MAX(position)+1` fuera de
  transacción (duplicados) y `ON CONFLICT DO NOTHING` responde 201 con
  `data: null` → un solo `INSERT ... SELECT COALESCE(MAX...)` y 200/409 en
  conflicto.
- `softDelete` re-marca descendientes ya borrados (pierde el `deleted_at`
  original): añadir `AND deleted_at IS NULL` al UPDATE.
