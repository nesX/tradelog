# Task: indicador de guardado a nivel nota ("Todos los cambios guardados")
2026-08-05 · Frontend · Impacto UX: MEDIO-ALTO

## Objetivo
Hoy solo los bloques text/callout muestran estado de guardado ("Guardando… /
Guardado ✓ / Error al guardar", por bloque, en `NoteBlockList.jsx`). El título,
los tags, el estilo de callout, los metadatos de galería y el follow-up guardan
en silencio total: ni éxito, ni error, ni "en vuelo". Un indicador único a nivel
nota (estilo Notion/Google Docs) da confianza de que nada se perdió.

> Nota: la parte de "autosave confiable" de esta mejora ya se implementó con los
> bug-fixes (hook `useAutosaveTextarea`: flush al desmontar, borrador en
> localStorage, no-revert en fallo). Este task es SOLO el indicador global.

## Implementación propuesta

### 1. Etiquetar las mutaciones de notas
Añadir `mutationKey` con prefijo común a todas las mutaciones de notas en
`hooks/useNotes.js` y `hooks/useBlockFollowUp.js`:

```js
useMutation({ mutationKey: ['notes', 'updateTitle'], ... })
```

(Las que ya existen no tienen `mutationKey` — verificado.)

### 2. Hook del indicador
`useIsMutating({ mutationKey: ['notes'] })` de TanStack Query cuenta las
mutaciones de notas en vuelo (el matching por prefijo es nativo). Estados:

- count > 0 → "Guardando…"
- count === 0 y última mutación OK → "Todos los cambios guardados" (con
  timestamp opcional: "guardado 12:34")
- última mutación con error → "⚠ Error al guardar — reintentar" (el detalle ya
  lo da el toast global del MutationCache; aquí basta el estado persistente).

Para el estado de error persistente: `useMutationState({ filters: { mutationKey:
['notes'], status: 'error' } })` o un pequeño estado alimentado por el
`MutationCache` ya existente en `App.jsx`.

### 3. Ubicación
Header del editor (`pages/NoteEditor.jsx`), junto al título/breadcrumb — texto
pequeño gris, sin robar atención. Visible también en la vista embebida
(`embeddedId`).

### 4. Simplificación opcional
Con el indicador global, el label por-bloque de `NoteBlockList.jsx`
(`saveStatus`) se puede simplificar o eliminar (dejar solo el estado de error
por bloque, que es el que aporta), reduciendo además re-renders de la lista
(cada transición Guardando→Guardado re-renderiza todos los bloques hoy).

## Criterios de aceptación
- Editar título, asignar tag, cambiar estilo de callout o metadata de galería →
  el indicador pasa por "Guardando…" y vuelve a "Todos los cambios guardados".
- Con el backend caído: el indicador queda en estado de error visible (además
  del toast) hasta que un guardado tenga éxito.
- El indicador no parpadea en cada keystroke (el debounce de los bloques ya lo
  evita: la mutación solo dispara al pausar).
