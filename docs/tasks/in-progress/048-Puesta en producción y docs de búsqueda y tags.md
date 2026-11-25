# Task: puesta en producción y documentación de búsqueda y gestión de tags
2026-11-25 · Ops + Docs · Búsqueda y tags 6/6 · Depende de: 043–047

## Objetivo
Llevar a prod la página `/buscar`, la página `/tags` y los grupos por usuario,
con la documentación al día.

## Alcance

### 1. Prod
- **Requisito:** la 042 terminada. La 030 tiene que estar aplicada en prod y el
  script de notas-categoría ya corrido.
- 043–045 no tienen migraciones y pueden salir antes, en su propio push.
- Grupos (046–047), en este orden:
  1. Backup de la BD, como en
     [database-ops.md](../../operations/database-ops.md).
  2. Aplicar la **031** en prod. El código viejo sigue funcionando porque
     `group_key` no se toca.
     Justo después, aplicar la **033** (orden de los tags dentro de su grupo;
     necesita el `group_id` de la 031). El código viejo no lee `position`.
  3. Push a `main` con 046–047 y esperar el deploy.
  4. Verificar en `https://tradelog.nesx.co`:
     - Los grupos sembrados y los tags en sus grupos.
     - Repaso por tag con un link guardado.
     - `/buscar` con tags de dos grupos.
  5. Si se creó o editó algún tag entre el paso 2 y el 3, revisarlo (también su
     lugar en el grupo: el código viejo lo crea con `position` 0, al principio).
     Volver a correr la 031 completa solo antes del paso 6.
  6. Aplicar la **032**, que borra `group_key`.
- Si algo falla entre el 3 y el 6, se puede volver al código anterior sin tocar
  la BD: `group_key` sigue ahí.

### 2. Documentación
- `docs/api/reference.md`:
  - Shape nuevo de `GET /api/notes/search`.
  - Endpoints de `/tag-groups`.
  - Tags con `group_id` en vez de `group_key`.
- `docs/architecture/database.md`: `note_tag_groups`, `note_tags.group_id`
  (`ON DELETE SET NULL`, NULL es Libre) y las migraciones 031 y 032.
- `docs/architecture/frontend.md`:
  - Las páginas `/buscar` y `/tags`, y los iconos del header.
  - Que ya no existen `NoteSearch`, `NoteSearchResults` ni `NoteTagManager`.
  - Los helpers de grupos con la lista de la API.
- [tags-bloques.md](../../features/specs/tags-bloques.md): marcar D1 como
  reemplazada (ver 046) y sacar "grupos definidos por el usuario" y "cambios en
  la búsqueda de notas" de §11.
- `CLAUDE.md`:
  - Las migraciones van de `001_` a `032_`.
  - `note_tags.group_key` pasa a `note_tag_groups` / `group_id`.
  - Las páginas Search y Tags en la lista de `pages/`.
- `docs/roadmap.md`.
- Mover 043–048 a `done/`.

## Criterios de aceptación
- `/buscar` y `/tags` funcionan en prod, en desktop y en móvil.
- En prod, `note_tags` no tiene `group_key` y cada tag está en su grupo o en
  Libre.
- La documentación no menciona grupos fijos ni `group_key`, salvo como
  historia.

## Estado (2026-11-25)
La documentación del §2 está hecha: `api/reference.md` (búsqueda, grupos y
`group_id`), `architecture/database.md` (031/032), `architecture/frontend.md`
(`/buscar`, `/tags`, header, helpers de grupos), `tags-bloques.md` (D1
reemplazada, §11, formato del mapeo del script), `features/README.md`,
`roadmap.md` y `CLAUDE.md`.

Falta todo el §1 (prod), que depende de la 042 (también pendiente en prod), y
mover 043–048 a `done/` al terminar. Antes, en dev: aplicar la 031, la 033 y la
032.

Añadido después: orden de los tags dentro de su grupo (migración 033,
`PUT /api/notes/tags/order` y flechas en `/tags`), con su documentación en
`api/reference.md`, `architecture/database.md`, `architecture/frontend.md`,
`roadmap.md` y `CLAUDE.md`.
