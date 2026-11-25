# Task: frontend — página `/tags` e icono en el header
2026-11-25 · Frontend · Búsqueda y tags 3/6 · Depende de: 044 (`HeaderIconLink`)

## Objetivo
Pasar el gestor de tags, hoy un modal que se abre desde el sidebar de Notas, a
una página `/tags` con un icono en el header. Con los grupos fijos de hoy. La
gestión de grupos llega en la 047, y el layout le deja lugar.

## Contexto
- `NoteTagManager.jsx` es un modal (`isOpen`/`onClose`). Se abre con el botón
  `Tags` de la cabecera del sidebar (`Notes.jsx:279`) y se monta en `:590`.
- Ya sabe:
  - Crear un tag con grupo, proponiendo el color del grupo.
  - Editar inline el nombre, el color y el grupo.
  - Borrar con confirmación.
  - Listar por grupos con `groupTags`.

## Alcance

### 1. Ruta y header
- `/tags` en `App.jsx`, igual que `/buscar`. Página `pages/Tags.jsx`.
- `Header.jsx`: `/tags` en `isNotesArea` y un icono `Tags` (lucide) con
  `HeaderIconLink`, junto a la lupa. Activo en `/tags`. `title`: "Tags".
- A 375 px el header del área de notas queda: Trades, Notas, TODO, campana,
  lupa, tags y hamburguesa. Comprobar que entra. Si no entra, Tags pasa al menú
  hamburguesa.

### 2. Página
- Sacar el contenido de `NoteTagManager` a la página, sin el modal. Mismas
  mutaciones y mismos mensajes.
- Layout:
  - Cabecera "Tags" y formulario **Nuevo tag**: nombre, grupo y el color que
    propone el grupo.
  - Filtro por nombre (`filterTags`: sin mayúsculas ni tildes).
  - Una tarjeta por grupo, en orden canónico, **incluidos los grupos vacíos**:
    - La cabecera lleva el nombre del grupo, su color y el número de tags. Ahí
      van las acciones de grupo de la 047.
    - Un botón "+" en la tarjeta abre el formulario con ese grupo elegido.
  - Fila de tag:
    - Badge, edición inline (nombre, color y grupo) y borrado con la
      confirmación actual: "Se quitará de todas las notas y bloques".
    - Link **Ver bloques** → `/buscar?tags=:id` (044).
- Errores del servidor en línea con `err.message`, como hoy (el 409 por nombre
  repetido).

### 3. Quitar el modal
- En `Notes.jsx`, quitar el botón `Tags` de la cabecera del sidebar (`:279`),
  `tagManagerOpen` (`:60`) y el montaje (`:590`). Quitar `Tags` del import de
  lucide si ya no se usa.
- Borrar `NoteTagManager.jsx`. Su paleta `DEFAULT_COLORS` se va con la página.
  Actualizar el comentario de `constants/tagGroups.js:5`, que la nombra.

## Criterios de aceptación
- El icono de tags aparece en el área de notas, resaltado en `/tags`.
- Desde la página se puede crear un tag en un grupo (también desde el "+" de
  la tarjeta), editarlo inline, cambiarlo de grupo y borrarlo.
- Los grupos vacíos se ven y se puede crear en ellos.
- El filtro encuentra "proyección" escribiendo "proyeccion".
- "Ver bloques" abre `/buscar` con ese tag elegido.
- El sidebar de Notas ya no tiene el botón de tags.
- A 375 px se usa sin zoom.
- `npm run lint`, `npm test` y `npm run build` limpios.

## Notas
- Fuera de alcance (posibles follow-ups): cuántos bloques usan cada tag, que
  la confirmación de borrado diga a cuántos afecta, y fusionar dos tags.

## Implementación (2026-11-25)
Hecha junto con la 047 (la página nació con los grupos de la API). Verificada en
el navegador contra el backend de la 046 (Vite del host + backend con una BD
desechable con 001–032 y datos de prueba), en escritorio, a 375 px y en claro y
oscuro: crear un tag arriba y desde el "+" de una tarjeta, editarlo inline,
cambiarlo de grupo, nombre repetido en línea, filtro "proyeccion" → "proyección",
"Ver bloques" → `/buscar?tags=:id` con el tag elegido. A 375 px no hay scroll
horizontal y el header entra con los 7 iconos más la hamburguesa. `npm run lint`
(solo los 4 warnings que ya había), `npm test` y `npm run build` limpios.

Desviaciones:
- Orden de los iconos: lupa, tags, campana (la 044 ya había puesto la lupa antes
  de la campana).
- El "+" de una tarjeta abre un formulario dentro de la tarjeta (sin selector de
  grupo), no el de arriba: en el celular no hay que volver al principio. Queda
  abierto para crear varios seguidos; Esc o la X lo cierran.
- Con el filtro activo solo se ven los grupos con coincidencias.
- Los errores van en línea y las mutaciones de la página silencian el toast
  global (`useCreateTag`/`useUpdateTag`/`useDeleteTag` aceptan `{ silenceError }`;
  el TagPicker sigue con el toast).
- Inputs en `text-base`: con menos, iOS hace zoom al enfocarlos.
- La tarjeta Libre lleva "tags sin grupo" junto al nombre (desde sm).
