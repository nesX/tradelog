# Task: frontend — página `/buscar` e icono de búsqueda en el header
2026-11-25 · Frontend · Búsqueda y tags 2/6 · Depende de: 043

## Objetivo
Sacar la búsqueda del sidebar de Notas a una página propia, `/buscar`, con
espacio para escribir, elegir tags por grupo y leer los resultados por bloque.
Se abre con una lupa en el header.

## Contexto
Hoy `NoteSearch` vive en el sidebar de `Notes.jsx` (`:333`), entre la cabecera
y el árbol:
- Tiene el ancho del sidebar. El filtro de tags es un dropdown plano, sin
  grupos.
- El estado vive en `Notes.jsx` (`searchParams`, `isSearchActive`): se pierde
  al abrir una nota y volver con Atrás.
- Los resultados reemplazan el panel derecho y solo muestran notas, con un
  snippet que mezcla todos los bloques.

## Alcance

### 1. Ruta y header
- Ruta `/buscar` en `App.jsx`, con `ProtectedRoute` + `Layout` como
  `/recordatorios` (`:214`). Página `pages/Search.jsx`.
- `Header.jsx`:
  - `/buscar` en `isNotesArea` (`:52`).
  - Icono `Search` (lucide) junto a la campana, en desktop (`:120`) y en móvil
    (`:162`), solo en el área de notas. Activo en `/buscar`, con el mismo
    estilo que la campana. `title` y `aria-label`: "Buscar".
  - La 045 agrega otro icono igual: sacar de `RemindersBell` un
    `HeaderIconLink` (link + estilos de activo) y que la campana lo use.

### 2. Estado en la URL
`/buscar?q=…&tags=1,4,7`:
- `useSearchParams` con `replace: true`. Reutilizar `parseTagIdsParam` y
  `formatTagIdsParam` (`utils/tagReview.js`).
- El input tiene estado local. `q` se escribe en la URL tras 400 ms de
  debounce, como en `NoteSearch`.
- Descartar los ids que no estén en `useNoteTags`, pero solo **después** de
  que los tags carguen. Si no, al recargar se pierde la selección (la misma
  trampa de la 039, §3).

### 3. Página
- Input grande arriba, con autofocus al entrar. Placeholder "Buscar en notas…".
  La X limpia el texto y los tags.
- Una línea de ayuda bajo el input: `"frase exacta"`, `-palabra` para excluir,
  `or` entre alternativas. Son las reglas de websearch que respeta la 043.
- Tags:
  - Debajo del input, chips de los tags elegidos (`NoteTagBadge` con X).
  - En lg+: `GroupedTagList` (035) en una columna fija a la derecha, con su
    filtro de texto. Por debajo de lg: botón **Tags (n)** que la despliega
    sobre los resultados.
  - Leyenda "Mismo grupo: cualquiera · Grupos distintos: todos a la vez", como
    en Repaso por tag.
- Sin texto ni tags, no consultar y mostrar "Escribe para buscar en títulos y
  contenido, o elige tags".

### 4. Resultados
- Resumen: "14 notas · 52 bloques". Si hay más notas que `limit`, "mostrando
  30 de 45 notas". Si `truncated`, avisarlo.
- **Repasar (52)** abre `BlockReviewViewer` (038) con todos los `block_ids` en
  el orden de los resultados. Título: "Búsqueda" más el texto y los tags.
- Una tarjeta por nota:
  - Título con highlight (`sanitizeHighlight`, como `HighlightedText` en
    `NoteSearchResults.jsx`) y breadcrumb (`buildBreadcrumb` con el `flat` de
    `useNoteTree`). Click → `/notes/:id`.
  - Hasta 3 bloques. Cada uno lleva:
    - El icono y el nombre del tipo (`BLOCK_OPTIONS` en
      `hooks/useBlockInserter.js`, como la lista de Repaso por tag).
    - El snippet con highlight, en 2 líneas.
    - Sus tags (`NoteTagBadge size="sm"`).

    Click → `/notes/:noteId?highlight=:blockId`, como "Abrir en la nota" del
    visor (`BlockReviewViewer.jsx:82`).
  - "+N bloques más" abre el visor con los `block_ids` de esa nota.

### 5. Datos
- `searchNotes` (`api/endpoints.js:259`) no cambia.
- `useNoteSearch` (`hooks/useNotes.js:316`) pasa al shape nuevo. La key lleva
  los ids ordenados, así la misma selección es la misma key. Conservar
  `placeholderData: keepPreviousData`.
- Agregar `noteKeys.search()` = `[...noteKeys.all, 'search']` y colgar de ahí la
  key. Invalidarla en el `onSettled` de `useAddBlockTag`/`useRemoveBlockTag`:
  si se cambian tags desde el visor, la lista no queda vieja al salir.

### 6. Sacar la búsqueda del sidebar
- En `Notes.jsx`, quitar:
  - `NoteSearch` (`:333`).
  - `isSearchActive`, `searchParams` y `handleSearchChange`.
  - La rama de resultados (`:472`).

  El `Search` de lucide se sigue usando en el modal de mover (`:634`).
- Borrar `NoteSearch.jsx` y `NoteSearchResults.jsx`. `HighlightedText` se
  mueve con la página.

## Criterios de aceptación
- La lupa aparece en todo el área de notas, en desktop y a 375 px, resaltada
  en `/buscar`.
- Escribir "proyec" muestra resultados mientras se escribe. Los bloques traen
  snippet resaltado y tags.
- Dos tags de grupos distintos filtran a los bloques que tienen ambos. Con
  texto, se combinan.
- Un click en un bloque abre la nota con el bloque resaltado. Atrás vuelve a
  `/buscar` con la misma consulta y los resultados, sin parpadeo.
- Recargar `/buscar?q=…&tags=…` repite la búsqueda.
- Repasar abre el visor, que recorre todos los bloques adelante y atrás.
- El sidebar de Notas ya no tiene buscador.
- A 375 px se usa sin zoom.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Notas
- "Por tag" en Repaso y `/buscar` solo con tags encuentran lo mismo. Repaso
  queda igual por ahora; si después sobra, es una decisión aparte.
- Fuera de alcance: atajo de teclado (Ctrl+K), búsquedas recientes y buscar en
  los captions de las imágenes.

## Implementación (2026-11-25)
Hecha. Verificada en el navegador contra la API de la 043 (Vite del host +
backend con una copia de la BD de dev): a 1440 px y a 375 px (sin scroll
horizontal; el header queda con 5 iconos más la hamburguesa), en claro y en
oscuro. "proyec" da resultados mientras se escribe. Con dos tags de grupos
distintos se combinan. Un click en un bloque abre la nota con `?highlight`, y
Atrás vuelve con la consulta y los resultados al instante. Recargar repite la
búsqueda, y Repasar recorre los bloques con ←/→. Si se quita un tag desde el
visor, la lista se actualiza al salir. `npm run lint` (solo los 4 warnings que
ya había), `npm test` y `npm run build` limpios.

Desviaciones:
- Los chips van en la columna de resultados, no encima de las dos columnas: al
  elegir el primer tag aparecían, el panel de la derecha bajaba y el segundo
  click caía en otro tag.
- Por debajo de lg, el panel de tags se despliega en línea, encima de los
  resultados (no como overlay).
- El autofocus solo aplica al entrar sin consulta: al volver con Atrás, en el
  celular el teclado taparía los resultados.
- Enter escribe la consulta sin esperar el debounce y cierra el teclado.
- Un texto sin letras ni dígitos ("???") no consulta y muestra la ayuda
  (`hasSearchText` en `utils/noteSearch.js`, mismo criterio que
  `buildSearchQuery`). Con tags en la URL, se espera a que carguen los tags
  antes de consultar.
- `GroupedTagList` en tamaño `lg` en el panel, por legibilidad y para el touch.
- "+N bloques más" no aparece si el tope de 500 dejó a esa nota sin
  `block_ids`.
- `utils/noteSearch.js` (resumen, título del visor, `hasSearchText`) con tests
  de `node --test`.
- No se verificó la posición del scroll al volver con Atrás si los resultados
  son largos: `BrowserRouter` no tiene `ScrollRestoration`.
