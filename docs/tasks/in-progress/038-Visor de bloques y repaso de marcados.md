# Task: frontend — visor de bloques (`BlockReviewViewer`) y "Repasar en visor"
2026-11-25 · Frontend · Tags por bloque 6/10 · Depende de: 036, 037

Spec: §5.7, §5.6 ("Pestaña de marcados") y §5.2 (`useNoteBlock`) de
[tags-bloques.md](../../features/specs/tags-bloques.md).

## Objetivo
Un visor a pantalla completa que recorre una lista fija de bloques con
adelante/atrás, en solo lectura, con los tags y la marca de repaso editables en
el pie. Se estrena con la lista de marcados de Repaso; la 039 lo usa para el
repaso por tag.

## Alcance

### 1. Datos
- `getNoteBlock(blockId)` → `GET /api/notes/blocks/:blockId` (037).
- `useNoteBlock(blockId)`: key `noteKeys.block(blockId)` y
  `select: (r) => r.data`, como `useNote`. Sin reintentos en 404: por defecto
  TanStack reintenta 3 veces y "Este bloque ya no existe" tardaría segundos.

### 2. `hooks/useSequenceNavigation.js`
`{ index, next, prev, hasNext, hasPrev }` sobre una longitud fija, sin dar la
vuelta al llegar al final, más teclado:
- ←/→ navegan y Esc llama a `onExit`.
- Ignora el teclado si el foco está en `input`, `textarea` o
  `[contenteditable]`, o si `enabled` es `false` (picker de tags o lightbox
  abiertos).

**El modal de trades no se migra al hook.** El spec pide extraer la
navegación del visor de trades a un hook compartido sin cambiar su
comportamiento, pero esa navegación (`TradeTable.jsx`, `navigateDetail` y
`pendingDetail`) cruza páginas del servidor y no tiene teclado. Meterla en el
hook obligaría a cambiar su comportamiento o a complicar el hook. Se reutiliza
su aspecto: los mismos botones `ChevronLeft` / `ChevronRight` con las clases de
`detailActions`. Si se quiere ←/→ también en trades, es otro cambio.

### 3. Bloques en solo lectura
- Prop `readOnly` en:
  - `NoteTextBlock` y `NoteCalloutBlock`: sin click para editar ni anillo de
    hover.
  - `NoteImageGalleryBlock` y `NoteImageBlock`: sin subir, borrar, reordenar
    ni editar captions.
  - `NoteTradeReferenceBlock`: sin añadir ni quitar trades.
- Extraer `BlockContent` de `NoteBlockList.jsx` a su propio archivo, con
  `readOnly`, para que lo usen la lista y el visor.
- En el visor las imágenes se ven grandes, y el click abre el `ImageViewer`
  que ya usan (lightbox).
- **Teclado del lightbox**: `Modal` escucha Esc en `document`, e
  `ImageViewer`, ←/→ a pantalla completa. Con el lightbox abierto, una tecla
  haría las dos cosas. Los bloques en `readOnly` avisan con
  `onLightboxChange(open)`, y el visor desactiva su teclado mientras tanto.

### 4. `components/notes/BlockReviewViewer.jsx` (§5.7)
No hay carpeta de componentes de Repaso: va junto a `blockReviewShared.jsx`.
Props `blockIds`, `initialIndex`, `title` y `onExit`.
- **Overlay**: `createPortal` a `document.body` con `fixed inset-0`. Repaso se
  renderiza dentro del `<main>` con scroll de `Notes.jsx`, y así, al salir, la
  pestaña conserva filtros y scroll. Usar **`z-40`**:
  - Tapa el header (`Header.jsx:89`, `z-40`), porque va después en el DOM.
  - Deja encima los toasts (`Toast.jsx:131`, `z-50`), que tienen que verse si
    falla una mutación en el visor.
  - El `Modal` del lightbox (`z-50`) queda encima del visor.

  Bloquear el scroll del body mientras está abierto.
- **Lista congelada**: `useState(() => blockIds)`. Al salir, invalidar
  `revisitKeys.all` (marcados y por tag).
- **Cabecera**: título, contador `7 / 23`, ← → y **Salir**.
- **Carga**:
  - `useNoteBlock` del bloque actual.
  - `prefetchQuery` del siguiente y del anterior, con la misma key y queryFn.
  - Si el siguiente es `image_gallery` o `image`, precargar su primera imagen
    (`new Image().src`, con la misma URL que arma `ImageViewer`).
- **Pie**:
  - Título de la nota con **Abrir en la nota**:
    `/notes/:noteId?highlight=:blockId`, como `BlockItem`. `NoteEditor` también
    acepta el `#block-:id` de las referencias.
  - `BlockTags` editable (036).
  - Toggle **Marcado para repaso** con `useToggleRevisit`. Es la marca
    `marked_for_revisit`: el spec dice `requires_follow_up`, pero esa es la de
    Revisión. Agregarle a `useToggleRevisit` un optimistic sobre
    `noteKeys.block(blockId)` con rollback; no afecta a sus otros usos.
- **Bloque borrado (404)**: "Este bloque ya no existe", y se puede seguir
  navegando.

### 5. "Repasar en visor" en los marcados (`pages/Repaso.jsx`)
- Botón en la cabecera de "Bloques para repasar": abre el visor con
  `data.blocks` en el orden mostrado y el título "Marcados para repaso".
- La lista no está paginada (`findMarkedForRevisit`, `LIMIT 200`): el visor
  recorre lo cargado.
- Opcional, según el spec: el mismo botón en "Actividad reciente", que está
  en `Review.jsx` (Revisión).

## Criterios de aceptación
- ←/→ y los botones navegan; Esc sale. Escribir en el picker no navega. Con el
  lightbox abierto, ←/→ y Esc solo afectan al lightbox.
- Desmarcar o quitar un tag no cambia el contador ni salta bloques.
- Al salir, la lista de marcados se refresca (el bloque desmarcado ya no
  está), con el scroll y el rango temporal como estaban.
- Un bloque borrado desde otra pestaña muestra "Este bloque ya no existe" y se
  sigue navegando.
- En Network, la primera imagen de la galería siguiente se pide antes de
  llegar a ella.
- "Abrir en la nota" lleva al bloque resaltado.
- Si falla una mutación en el visor, se ve el toast.
- El modal de detalle de trades funciona igual (su código no cambia).
- A 375 px y en táctil, el visor se usa sin zoom.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Notas
- Opcional: `hooks/useSwipe.js` (ya lo usa `ImageViewer`) para navegar con
  swipe en tablet.

## Implementación (2026-11-25)
Hecha. Verificada en Chrome: ←/→ y Esc; escribir en el picker no navega; Esc con
el picker abierto solo lo cierra; con el lightbox abierto ← no mueve el visor y
Esc solo cierra el lightbox; desmarcar no cambia el contador; al salir la lista
de marcados se refresca; bloque borrado → "Este bloque ya no existe" y se sigue;
"Abrir en la nota" resalta el bloque; en Network el bloque siguiente y la
primera imagen de la galería se piden antes de llegar; 375 px.

Desviaciones:
- Texto y callout en `readOnly` son componentes aparte, sin `useAutosaveTextarea`:
  al montar, ese hook re-guarda los borradores huérfanos.
- `hooks/useReportOpen.js` avisa `onLightboxChange` sin depender de la identidad
  del callback. La lógica de teclas está en `utils/sequenceNavigation.js`, con test.
- Sin swipe (opcional): `useSwipe` captura el puntero y le quitaría los clicks a
  las imágenes y trades del bloque.
- "Repasar en visor" no se agregó a "Actividad reciente" (opcional).
