# Bug: el DnD del cliente permite ciclos en la UI optimista
2026-08-05 · **Severidad: MEDIA (glitch visual + error genérico)** · Frontend

## Problema
El backend SÍ rechaza ciclos (`note.service.js:139-142`), pero el cliente no los
filtra antes:

1. `frontend/src/components/notes/NoteTree.jsx:117-133` +
   `utils/treeManipulation.js:6-33`: `handleDragEnd` permite soltar una nota
   como `child` de su propio descendiente. El update optimista crea el ciclo
   localmente → en `buildTree` (`hooks/useNotes.js:13-28`) ninguno de los nodos
   queda como raíz y **el subtree entero desaparece del sidebar** hasta el
   refetch (que restaura el estado real al fallar el request).
2. `pages/Notes.jsx:483-485`: el modal "Mover nota" lista como destino a los
   descendientes de la nota que se mueve → al elegir uno, error 400 genérico.

## Fix
- Calcular el set de descendientes del nodo arrastrado (ya existe la lógica de
  recorrido en `treeManipulation.js`) y: abortar el drop (o degradar a sibling)
  cuando el target está en el set; excluir descendientes de la lista del modal.
- Mantener la validación del backend como está (defensa en profundidad).

## Verificación
- Arrastrar un padre dentro de su sub-nota → el drop no se acepta y el árbol no
  parpadea.
- Modal "Mover nota" → los descendientes no aparecen como destino.
