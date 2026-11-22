# Bug: pérdida de texto en el autosave del editor de notas
2026-08-05 · **Severidad: ALTA (pérdida de datos)** · Frontend

Tres vías confirmadas de pérdida del texto que el usuario está escribiendo.
Afecta a `NoteTextBlock.jsx` y `NoteCalloutBlock.jsx` por igual (código duplicado).

## 1. Desmontaje con debounce pendiente descarta el último tramo
`frontend/src/components/notes/NoteTextBlock.jsx:64` (ídem `NoteCalloutBlock.jsx:74`):
el cleanup del efecto hace `clearTimeout(debounceRef.current)` **sin flush**.
Si el componente se desmonta sin blur del textarea (navegación por URL, back del
navegador, refetch que quita el bloque), se pierde hasta 1s de tipeo sin aviso.

**Fix**: en el cleanup, si hay timer pendiente hacer flush con el último valor
(guardado en un ref), en vez de solo cancelar.

## 2. Si el PATCH falla, el bloque revierte y el borrador se pierde
`NoteTextBlock.jsx:31-35` + `66-70`: `handleBlur` llama `onUpdate(value)` y
`setEditing(false)`; el efecto de sync (`if (!editing) setValue(block.content)`)
corre con el contenido viejo de la caché. Si el PATCH falla (red caída, 500), el
texto tecleado desaparece de la UI de forma permanente; solo queda el label
"Error al guardar" (`NoteBlockList.jsx:269`) sin reintento.

**Fix**: no resetear `value` desde caché mientras haya guardado en vuelo o
fallido (comparar con "último valor enviado con éxito"); en error, conservar el
borrador y ofrecer reintento (toast persistente).

## 3. 401 durante autosave destruye todo el estado local
`frontend/src/api/client.js:50-55`: cualquier 401 borra el token y hace
`window.location.href = '/login'` (hard redirect). Si el JWT (7d) expira mientras
el usuario escribe, el PATCH del debounce devuelve 401 → redirección inmediata
que pierde todo lo no guardado.

**Fix**: antes de redirigir, persistir borradores pendientes en localStorage
(clave por blockId) y restaurarlos tras el re-login; o al menos evitar el hard
redirect para requests de autosave.

## Relacionado (menor, mismo archivo)
- PATCHes potencialmente fuera de orden: el fire del debounce y el flush del blur
  pueden generar dos PATCH en vuelo; last-write-wins sin versión. Serializar
  guardados por bloque.
- Al extraer el fix, aprovechar para unificar las ~80 líneas duplicadas entre
  NoteTextBlock y NoteCalloutBlock en un hook `useAutosaveTextarea`.
