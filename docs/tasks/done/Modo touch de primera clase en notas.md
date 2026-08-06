# Task: Modo touch de primera clase en notas (PWA tablet)
2026-08-05 · Frontend · Impacto UX: ALTO (la app se usa como PWA en tablet)

## Objetivo
Hoy medio feature de notas es inusable en pantallas táctiles: casi todos los
controles aparecen solo con hover (`opacity-0 group-hover:opacity-100`) y el
drag-and-drop compite con el scroll. En touch no existe hover; los controles
dependen de la emulación inconsistente del primer tap.

## Alcance

### 1. Controles visibles sin hover
Inventario completo de controles solo-hover (verificado):

- `components/notes/NoteTreeItem.jsx:58` (grip de drag), `:96` (botón +), `:105` (borrar)
- `components/notes/NoteBlockList.jsx:95` (grid de acciones del bloque)
- `components/notes/NoteBlockAddButton.jsx:33` (botón + entre bloques)
- `components/notes/NoteImageGalleryBlock.jsx:132` (borrar imagen), `:278` (lápiz de metadata)
- `components/notes/SectionDivider.jsx:86` (grip), `:121` (menú)
- `pages/NoteEditor.jsx:215` (lápiz de título)

Implementación propuesta: variante custom de Tailwind para dispositivos sin
hover, en `tailwind.config.js`:

```js
plugins: [
  plugin(({ addVariant }) => {
    addVariant('touch', '@media (hover: none)');
  }),
],
```

y en cada control añadir `touch:opacity-60` (o `touch:opacity-100` en los
críticos como borrar/+). El patrón `opacity-0 group-hover:opacity-100
touch:opacity-60` mantiene el look limpio en desktop y hace todo accesible en
tablet. Alternativa sin config: variante arbitraria `[@media(hover:none)]:opacity-60`.

### 2. Acciones de bloque dentro del viewport
`NoteBlockList.jsx:93`: el grid de acciones está en `absolute -right-14`, fuera
de la columna `max-w-3xl` → en anchos estrechos queda cortado o fuera de
pantalla. En `< md`, reubicarlo dentro del ancho del contenido (p. ej. fila
superior derecha del bloque, `md:-right-14 right-1 -top-2 md:top-auto`), o
mostrarlo tras un tap de selección del bloque.

### 3. Drag-and-drop compatible con touch
`NoteTree.jsx:124-127` y `NoteBlockList.jsx:341-344`: solo `PointerSensor`
(distance 8) + `KeyboardSensor`. Arrastrar el grip en tablet scrollea la página
en vez de (o además de) arrastrar.

- Añadir `TouchSensor` de `@dnd-kit/core`:
  ```js
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  ```
  (mantener PointerSensor para mouse; dnd-kit usa el sensor que corresponda).
- Añadir `touch-none` (Tailwind → `touch-action: none`) a los activadores de
  drag: el grip de `NoteTreeItem.jsx:55-62`, el de `SectionDivider.jsx:86` y el
  handle de bloque en `NoteBlockList.jsx` (el elemento con `{...listeners}`).
  SOLO en los handles, nunca en la fila entera (mataría el scroll).

## Criterios de aceptación
- En una tablet (o DevTools en modo touch): todos los controles del inventario
  son visibles/alcanzables sin hover.
- Arrastrar desde el grip mueve la nota/bloque sin scrollear; arrastrar desde
  el resto de la fila scrollea normal.
- Las acciones de bloque son visibles y clicables con la ventana a 768px o menos.
- Desktop no cambia (los controles siguen apareciendo con hover).

## Verificación
Chrome DevTools → device toolbar (touch) sobre `npm run dev`, y prueba real en
la tablet con la PWA instalada. No hay tests de frontend configurados.
