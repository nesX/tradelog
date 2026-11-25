# Task: backend — grupos de tags por usuario (migraciones 031/032 y API)
2026-11-25 · Backend + BD · Búsqueda y tags 4/6 · Depende de: 042 (030 en prod)

## Objetivo
Que cada usuario cree, renombre, recolore, ordene y borre sus grupos de tags.
Hoy los grupos son fijos: columna `note_tags.group_key` con un CHECK y la lista
`TAG_GROUPS` repetida en backend y frontend.

Revierte la decisión D1 de
[tags-bloques.md](../../features/specs/tags-bloques.md) siguiendo el camino que
anota su §11, con una variante: **"Libre" no es una fila**. Un tag sin grupo
tiene `group_id = NULL`, se muestra como "Libre" y va siempre al final. Así no
hay un grupo especial que no se pueda borrar, y borrar un grupo es un
`ON DELETE SET NULL`.

## Alcance

### 1. `database/031_migration_tag_groups.sql`
Idempotente, como la 030:

```sql
CREATE TABLE IF NOT EXISTS note_tag_groups (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_note_tag_groups_user_name
  ON note_tag_groups (user_id, LOWER(name));

ALTER TABLE note_tags
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES note_tag_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_note_tags_group ON note_tags (group_id);
```

- **Semilla:** Activo, Tipo, Estrategia y Resultado, con los colores y el orden
  de hoy, solo para los usuarios que **no tienen ningún grupo**. Si se vuelve a
  correr, no resucita un grupo que el usuario borró. Libre no se siembra.
- **Pasar los tags:** `UPDATE note_tags … SET group_id = g.id WHERE group_id IS NULL
  AND group_key <> 'libre' AND LOWER(g.name) = group_key`. Las claves coinciden
  con los nombres en minúsculas. Envolver el UPDATE en un `DO $$ … IF EXISTS
  (columna group_key) …`: si no, la 031 falla al correr después de la 032.
- No borra `group_key`. El código viejo lo sigue usando entre la migración y el
  deploy.
- Usuarios nuevos: empiezan solo con Libre y crean sus grupos. En una BD vacía
  (setup desde cero) no hay usuarios que sembrar.

### 2. `database/032_drop_tag_group_key.sql`
`DROP CONSTRAINT IF EXISTS note_tags_group_key_check` y
`DROP COLUMN IF EXISTS group_key`. En dev se aplica junto con la 031. En prod
se aplica **después** del deploy (048).

### 3. API de grupos
Bajo `/api/notes`, como los tags. Con `user_id` en todo, `AppError` y mensajes
en español.

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/tag-groups` | — | `[{ id, name, color, position, tag_count }]` por `position, id` |
| POST | `/tag-groups` | `{ name, color? }` | el grupo (`sendCreated`), al final |
| PATCH | `/tag-groups/:groupId` | `{ name?, color? }` | el grupo |
| DELETE | `/tag-groups/:groupId` | — | `{ id, moved_tags }`: sus tags pasan a Libre |
| PUT | `/tag-groups/order` | `{ group_ids }` | la lista ordenada |

- La ruta estática `/tag-groups/order` va antes de `/tag-groups/:groupId`.
- Validators:
  - `name`: de 1 a 50 caracteres, con trim.
  - `color`: el mismo patrón hex que los tags.
  - `group_ids`: array de enteros positivos.
- Reglas del service:
  - Nombre repetido (sin mayúsculas): `ConflictError('Ya existe un grupo con ese nombre')`.
  - "Libre" está reservado: `ValidationError('"Libre" es el grupo de los tags sin grupo')`.
  - Máximo `TAG_GROUPS_MAX = 20` por usuario.
  - Grupo ajeno o inexistente: `NotFoundError('Grupo no encontrado')`.
  - `order`: `group_ids` tiene que ser exactamente el conjunto de grupos del
    usuario. Si no, `ValidationError`. Un solo UPDATE con
    `unnest($2::int[]) WITH ORDINALITY`.

### 4. Tags
- El shape pasa a ser `{ id, name, color, group_id }` en **todas** las
  respuestas: CRUD, notas, bloques, repaso, búsqueda (043) y `getTree`.
  `group_key` desaparece.
- `POST /tags` y `PATCH /tags/:tagId` aceptan `group_id` (entero positivo o
  `null`) en lugar de `group_key`, y comprueban que el grupo sea del usuario.
- **Orden canónico:** `tagOrder` (`note.repository.js:7`) pasa a ser
  `g.position NULLS LAST, g.id, LOWER(t.name)`, con un
  `LEFT JOIN note_tag_groups g ON g.id = t.group_id` en cada query que ordena
  tags. Hoy hay unas 24 referencias a `group_key`/`TAG_GROUPS` en el repo, y
  cada una deja de recibir `TAG_GROUPS` como parámetro.
- **AND entre grupos:**
  - En `findBlocksByTags` (`:1008`) y en la búsqueda (043), usar
    `COUNT(DISTINCT COALESCE(t.group_id, 0))`. `COUNT(DISTINCT)` ignora los
    NULL: sin el `COALESCE`, un tag Libre no contaría como grupo y el AND no
    se cumpliría nunca.
  - El `groupCount` del service (`note.service.js:731`) pasa a
    `new Set(tags.map((t) => t.group_id ?? 0)).size`.
- **Export** (`note.service.js:875`): `group` pasa a ser el nombre del grupo, o
  "Libre".

### 5. Script de notas-categoría (041)
- `blockTagsMigration.js` y `migrate-block-tags.js`: el `group` del mapeo se
  busca por nombre, sin mayúsculas, entre los grupos del usuario. `libre` o sin
  `group` → `NULL`. Un nombre que no existe es un error de validación del
  mapeo.
- El color de un tag creado por el script es el del grupo, ya no
  `TAG_GROUP_COLORS`.
- Si la 042 ya corrió el script en prod, solo hace falta adaptarlo, con sus
  tests.

### 6. Constantes
`constants/tagGroups.js`:
- Se van `TAG_GROUPS`, `DEFAULT_TAG_GROUP` y `TAG_GROUP_COLORS`.
- Se agregan `TAG_GROUPS_MAX` y `FREE_GROUP_COLOR = '#6B7280'`.
- Quedan los topes del repaso.

### 7. Tests
- Service de grupos: nombre repetido, "Libre" reservado, el tope, grupo ajeno,
  `order` con ids de más o de menos, y que borrar un grupo deje sus tags en
  Libre.
- `groupCount` con tags Libre.
- Actualizar los tests de validators, de `note.service` y de
  `blockTagsMigration` que hoy usan `group_key`.

## Criterios de aceptación
- La 031 corre dos veces sin error y la 032 también. La 031 corre después de
  la 032 sin error.
- Tras la 031, cada tag de un usuario existente tiene el `group_id` de su
  antiguo `group_key`, y los de `libre` quedan con `NULL`.
- Al borrar un grupo, sus tags pasan a Libre y siguen asignados a sus notas y
  bloques.
- `GET /blocks/by-tags` con un tag Libre y uno de Activo devuelve solo los
  bloques que tienen los dos.
- Reordenar grupos cambia el orden de los tags en todas las respuestas.
- Ninguna respuesta trae `group_key`.
- `npm run lint` y `npm test` limpios.

## Implementación (2026-11-25)
Hecha. La BD de dev no aceptó la contraseña de `backend/.env`, así que todo se
verificó en un Postgres 12 desechable con 001–030, datos de prueba (tres
usuarios, tags en todos los grupos, uno sin tags) y luego 031/032:
- La 031 dos veces, la 032 dos veces y la 031 después de la 032: sin errores.
- Tras la 031, cada tag con el `group_id` de su `group_key`, los de `libre` en
  NULL; los tres usuarios con los cuatro grupos. Un grupo borrado no vuelve al
  re-correr la 031, y sus tags quedan en Libre con sus asignaciones.
- Por HTTP: CRUD y orden de grupos, nombre repetido (409), "Libre" (400), grupo
  ajeno (404), `order` con ids de menos (400), tag con grupo ajeno (404),
  `/blocks/by-tags` y `/search` con NQ (Activo) + zeta (Libre) → solo el bloque
  que tiene los dos, dos tags Libre → OR, reordenar cambia el orden de los tags
  en el detalle, el export trae `group` con el nombre o "Libre" y ninguna
  respuesta trae `group_key`.
- El script 041 en dry-run contra esa BD: grupo inexistente → error del mapeo;
  tag nuevo con el color de su grupo; tag de Libre pasa al grupo; ROLLBACK.
`npm run lint` y `npm test` (340) limpios.

Desviaciones:
- La semilla también va dentro del `IF EXISTS (group_key)`: tras la 032, volver a
  correr la 031 no siembra nada (si no, un usuario que borró todos sus grupos los
  recuperaría).
- "Libre" reservado sin distinguir mayúsculas. Constante `FREE_GROUP_NAME`.
- Un `:groupId` que no es entero da 404 (no 500).
- Los SELECT/RETURNING de tags usan columnas explícitas (`TAG_COLUMNS`), no `*`:
  entre la 031 y la 032 `RETURNING *` habría devuelto `group_key`.
- `getTree` también trae `group_id` en los tags.
- Script 041: `created_tags` del reporte lleva `group` (nombre) en vez de
  `group_key`; el rollback imprime cualquiera de los dos (reportes viejos).

**Pendiente en dev:** aplicar la 031 y la 032 a `tradelog-db` (el código ya no
lee `group_key`; sin la 031 el backend de dev falla en las queries de tags).
