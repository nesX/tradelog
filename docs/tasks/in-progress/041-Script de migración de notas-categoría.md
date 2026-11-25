# Task: backend — script de migración de notas-categoría a tags de bloque
2026-11-25 · Backend · Tags por bloque 9/10 · Depende de: 034

Spec: §7 de [tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Convertir las notas-categoría actuales (las que juntan bloques o referencias de
un tema) en tags de bloque, para un usuario, con dry-run, reporte y rollback, y
sin borrar nada (D10). Solo depende de la Fase 1: conviene adelantarlo para
probar el repaso por tag (039) con datos reales.

## Alcance

### 1. Estructura
No hay convención de scripts de Node en el repo: `trading-journal/scripts/`
solo tiene los `.sh` de backups.
- **Lógica** en `src/services/blockTagsMigration.js`: así entra en
  `npm run lint` (solo mira `src/`) y en Jest, con el cliente de BD mockeado.
- **CLI** en `backend/scripts/migrate-block-tags.js`: lee argumentos y mapeo,
  llama a la lógica y escribe el reporte. Las tres formas del §7: dry-run por
  defecto, `--apply` y `--rollback <reporte>`.
- **Conexión**: el `pool` de `src/config/database.js`, y `closePool()` al
  terminar. Importar `database.js` carga `config/env.js`, que exige todas las
  variables del backend, así que el script se corre dentro del contenedor
  (`docker exec tradelog-backend node scripts/migrate-block-tags.js …`). En dev
  el contenedor monta `./backend`; la imagen de prod copia todo
  (`COPY . .`).
- **Transacción a mano** (`BEGIN`, y al final `ROLLBACK` en dry-run o `COMMIT`
  en apply): `withTransaction` siempre confirma. Tomar
  `pg_advisory_xact_lock(userId)`, el mismo lock de `withUserLock`, para no
  cruzarse con un `createBlock` del usuario.

### 2. Comportamiento (§7, pasos 1–10)
Con el esquema real (ver 033):
- **Validar**: el usuario existe; cada nota es suya, no está borrada y es
  `type = 'note'`; los nombres tienen de 1 a 100 caracteres; los grupos están
  en `TAG_GROUPS`.
- **Resolver tags** por nombre sin distinguir mayúsculas (`LOWER(name)`, como
  el índice `idx_note_tags_unique_name`):
  - Si no existe, se crea con su grupo y el color del grupo (los de
    `frontend/src/constants/tagGroups.js`, 035).
  - Si existe en `libre` y el mapeo dice otro grupo, se cambia y queda en
    `group_changes`.
  - Si existe en otro grupo distinto de `libre`, se respeta y va a `warnings`.
- **Defaults de la nota** (`noteDefaults`, `true` por defecto): insertar en
  `note_tag_assignments` con `ON CONFLICT DO NOTHING RETURNING`.
- **Fase A**: los tags de la nota en sus bloques directos que no son
  `reference`.
- **Fase B**: por cada `reference` de una nota mapeada:
  - Con `metadata.target_block_id`:
    - Destino válido (bloque del usuario, en una nota no borrada y que no es
      `reference`): recibe los tags de la nota donde vive la referencia, así
      que queda `redundante` (el destino ya tiene todos esos tags).
    - Destino inexistente, ajeno o en la papelera: `rota`.
    - Destino que es otra referencia: `rota`, con un warning (el spec no cubre
      este caso).
  - Sin `target_block_id` (con `metadata.target_note_id`, o `linked_note_id`
    si es una sub-nota): `apunta_a_nota`.
  - Las `rota` y las `apunta_a_nota` no se tocan.
- **Inserciones** siempre con `RETURNING`, para que el reporte liste solo las
  filas que de verdad se insertaron.
- **Reporte**: `reports/block-tags-<timestamp>.json` (`.dryrun.json` en
  dry-run), con los campos del §7 (paso 6) más `userId`, y un resumen en
  consola.
- **Rollback**:
  - Borra exactamente las filas de `inserted_block_tags` e
    `inserted_note_tags`, dentro del `userId` del reporte, en una transacción.
  - Lista los tags creados y los cambios de grupo para revertirlos a mano.
  - Rechaza un `.dryrun.json`.
- Nunca borra referencias ni notas.

### 3. `.gitignore`
Agregar `backend/reports/` y el archivo de mapeo: los dos tienen títulos de
notas, y el `.gitignore` actual no los cubre.

## Criterios de aceptación
- El dry-run no cambia nada: los conteos de `note_block_tag_assignments`,
  `note_tag_assignments` y `note_tags` son iguales antes y después.
- `--apply` inserta, y un segundo `--apply` inserta 0.
- `--rollback` deja las asignaciones como estaban antes del apply.
- Un mapeo con una nota ajena, borrada o de tipo `section`, o con un grupo
  inválido, falla en la validación sin tocar nada.
- El reporte clasifica bien una referencia a un bloque, una rota y una que
  apunta a una nota.
- `npm test` y `npm run lint` limpios.

## Tests (Jest, cliente mockeado)
- Validación del mapeo.
- Resolución de tags: crear, pasar de `libre` al grupo del mapeo y conflicto
  con warning.
- Clasificación de referencias: `redundante`, `rota` y `apunta_a_nota`.
- El rollback rechaza un reporte de dry-run.

## Notas
- **Operación** (§7): dry-run contra una copia local de la BD de prod (un dump
  restaurado en el Docker de dev), revisar el reporte y recién entonces
  `--apply` en prod. Eso es la 042.
- En prod, `reports/` no es un volumen: copiar el reporte al host con
  `docker cp tradelog-backend:/usr/src/app/reports/<archivo> .` antes de
  recrear el contenedor. Lo necesita el rollback.
- El mapeo entra al contenedor de prod con `docker cp`; en dev basta dejarlo en
  `backend/`.

## Implementación (2026-11-25)
Hecha. Probada contra un Postgres local con una nota-categoría con un bloque
directo y cuatro referencias (válida, rota, a nota y a otra referencia): mapeo
inválido y notas ajena/sección/borrada fallan sin tocar nada; el dry-run no
cambia los conteos; `--apply` inserta y un segundo `--apply` inserta 0; el
rollback deja las asignaciones como antes y lista el tag creado y el cambio de
grupo.

Desviaciones:
- Una referencia sin ningún destino (ni bloque ni nota) se reporta como `rota`.
- El mapeo exige al menos un tag por nota y rechaza notas repetidas.
- Los colores por grupo están en `TAG_GROUP_COLORS` (`backend/src/constants/tagGroups.js`).
- El reporte agrega `mode`, `generated_at` y, por referencia,
  `assignments_created`.
