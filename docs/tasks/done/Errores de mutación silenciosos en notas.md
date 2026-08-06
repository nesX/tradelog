# Bug: errores de mutación silenciosos en todo el feature de notas
2026-08-05 · **Severidad: MEDIA (UX / integridad percibida)** · Frontend

## Problema
Casi ninguna mutación de notas tiene `onError` ni muestra feedback al fallar:
`useCreateNote`, `useDeleteNote`, `useMoveNote`, `useUpdateNoteTitle`,
`useAssignTags`, `useUpdateBlockMetadata`, `useDeleteImage`, `useToggleFollowUp`
(`frontend/src/hooks/useNotes.js`, `hooks/useBlockFollowUp.js`), y varios
handlers hacen `mutateAsync` sin try/catch
(`pages/Notes.jsx:92-95,110-121,148-152,159-162`).
`NoteExportMenu.jsx:18-51` usa try/finally sin catch (rechazo no capturado).

Escenario: el usuario borra una nota sin conexión → no pasa nada visible.
Cambia un título → falla → revierte en el próximo refetch sin explicación.

## Fix
Un `MutationCache.onError` global en la configuración del QueryClient con toast
de error por defecto — una sola pieza de código cubre toda la clase de fallos
(en notas y en el resto de la app). Las mutaciones que ya manejan su error
pueden optar por silenciar el global vía `meta`.

Añadir try/catch con feedback en los `mutateAsync` encadenados (ver task
"Orquestaciones multi-request sin manejo de fallo parcial", que es el caso grave).

## Verificación
- Con el backend apagado: borrar nota, renombrar, asignar tag, exportar → toast
  de error visible en todos los casos.
