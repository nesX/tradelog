# Task: frontend — pestaña "Por tag" en Repaso
2026-11-25 · Frontend · Tags por bloque 7/10 · Depende de: 035, 037, 038

Spec: §5.6 y §5.2 (`useTagReviewBlocks`) de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Repasar por combinación de tags: elegir tags agrupados, ver cuántos bloques
cumplen y recorrerlos en el visor, con la selección en la URL para que un
enlace guardado repita la consulta. Cierra la Fase 3.

## Alcance

### 1. Datos
- `getTagReviewBlocks(tagIds)` → `GET /api/notes/blocks/by-tags` (037).
- `useTagReviewBlocks(tagIds)`:
  - Key `revisitKeys.byTags(ids)` = `['revisit', 'tags', { tagIds }]`, con los
    ids ordenados para que sea estable. Cuelga de `revisitKeys.tags` (035).
  - `enabled` solo con al menos un tag.
  - `placeholderData: keepPreviousData`.

### 2. Pestañas en `pages/Repaso.jsx`
Hoy Repaso no tiene pestañas. Agregar **Marcados** (el contenido actual, sin
cambios) y **Por tag**.

### 3. Estado en la URL
- `?tab=tags&tags=1,4,7&order=chrono` con `useSearchParams` y
  `replace: true`. Sin `tab`, Marcados.
- Antes de consultar, descartar los ids que no estén en `useNoteTags`. Hay que
  esperar a que los tags carguen: si no, al recargar se descartaría toda la
  selección.
- **Repaso embebido en `Notes.jsx`**. Es la entrada habitual (botón Repaso del
  sidebar), y ahí la URL es `/notes`, con `isRepasoActive` en estado local
  (`Notes.jsx:65`):
  - Recargar `/notes?tab=tags&…` vuelve a Recientes.
  - Lo mismo al volver con Atrás desde "Abrir en la nota".

  `Notes.jsx` tiene que mostrar Repaso cuando la URL trae `tab=tags` y no hay
  nota seleccionada. `/repaso` funciona sin cambios.

### 4. Selector y orden
- `GroupedTagList` (035) siempre visible, con filtro de texto. Debajo: "Mismo
  grupo: cualquiera · Grupos distintos: todos a la vez".
- Sin selección: "Elige uno o más tags para empezar", sin consultar.
- Orden en cliente sobre `items`:
  - **Cronológico** (default): del más antiguo al más reciente, por
    `created_at`.
  - **Recientes primero**.
  - **Aleatorio** (Fisher-Yates). Se recalcula al cambiar el orden o el
    **conjunto** de ids, no en cada refetch: si no, la invalidación al salir
    del visor (038) lo barajaría de nuevo. Lista y visor comparten ese orden.

### 5. Resultado
- Contador "23 bloques"; si `truncated`, "mostrando 500 de 812".
- **Repasar (23)** abre el visor (038) en el índice 0.
- Lista compacta. Cada fila lleva:
  - El icono del tipo. `BLOCK_OPTIONS` (`hooks/useBlockInserter.js`) ya tiene
    icono y nombre por `block_type`.
  - `preview` en una línea, o el nombre del tipo si es `null`.
  - Título de la nota y fecha.
  - Indicador de marcado: `marked_for_revisit`, con `BookMarked` como en
    Repaso.
- Click en una fila: abre el visor en ese índice.
- Sin resultados: "Ningún bloque tiene esa combinación de tags."
- Título del visor desde la selección, en orden canónico: grupos separados por
  " · " y tags del mismo grupo por ", ". Ejemplo: "NQ · proyección, trade
  perdido".

### 6. Helpers puros
En `utils/tagReview.js`, con test de `node --test`:
- Leer y escribir el parámetro `tags`.
- Ordenar, con el `random` inyectable para el test.
- Armar el título del visor.

## Criterios de aceptación
- `NQ` + (`proyección`, `trade perdido`) muestra los bloques del criterio de
  la 037, con el texto de ayuda.
- Recargar `/notes?tab=tags&tags=…&order=…` (embebido) y `/repaso?…` repite la
  consulta. Un id de tag borrado en la URL se ignora, sin 400.
- Cambiar el orden no vuelve a pedir datos. El aleatorio es el mismo en la
  lista y en el visor, y no cambia al volver del visor.
- Click en una fila abre el visor en ese bloque; **Repasar (N)**, en el
  primero.
- Con más de 500 resultados se ve "mostrando 500 de N".
- La pestaña Marcados funciona como antes, más el botón de la 038.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Implementación (2026-11-25)
Hecha. Verificada en Chrome: NQ + (proyección, trade perdido) → los bloques
esperados; recargar `/notes?tab=tags…` (embebido) y `/repaso?…` repite la
consulta; un id inexistente en la URL se ignora sin 400; el aleatorio es el mismo
en lista y visor y no cambia al volver del visor; Atrás desde "Abrir en la nota"
vuelve a Repaso.

Notas:
- `order` siempre va en la URL al elegir tags u orden (formato del spec). Las
  comas del parámetro salen codificadas (`%2C`) al escribirlo desde la app; una
  URL con comas literales funciona igual.
- El aleatorio se baraja de nuevo al volver a montar la página (recarga o Atrás):
  solo se conserva mientras la pestaña sigue montada.
- Botón "Limpiar" para vaciar la selección.
