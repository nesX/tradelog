# Progreso de Implementación: Drag & Drop para Notas

Este documento detalla el estado actual de la implementación del feature de Drag & Drop para notas y bloques (basado en `Implementación: Drag & Drop para Notas.md`), para que otro agente pueda retomar el trabajo.

## 🟢 Lo que ya está completado

### 1. Dependencias
- [x] Instalado `fractional-indexing` en el backend.
- [x] Instalados `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` y `fractional-indexing` en el frontend.

### 2. Base de Datos
- [x] Creado el script de migración `database/migration_dnd.sql` que añade las columnas `position_new` (tipo texto para fractional indexing) a `notes` y `note_blocks`, actualiza los datos existentes rellenando con ceros (`a00000X`), elimina la columna vieja y crea los índices parciales optimizados.

### 3. Backend (Completo)
- [x] **Repositorio (`note.repository.js`)**: Implementados los métodos para leer y actualizar la base de datos usando validación de ciclos e ids, y posiciones relativas (`getDescendantIds`, `findNoteByIdAndUser`, `getLastChildPosition`, `getSiblingPositions`, `updateNoteParentAndPosition`, `findBlockByIdAndUser`, `getSiblingBlockPositions`, `updateBlockPosition`).
- [x] **Servicio (`note.service.js`)**: Implementados los métodos `moveDnd` y `moveBlockDnd` que usan `generateKeyBetween` de `fractional-indexing` para calcular la nueva posición y hacer un solo UPDATE por movimiento.
- [x] **Validadores (`note.validator.js`)**: Agregados `moveDndNoteSchema` y `moveBlockDndSchema`.
- [x] **Controladores (`note.controller.js`)**: Agregados los handlers `moveDndNote` y `moveBlockDnd`.
- [x] **Rutas (`note.routes.js`)**: Registrados los endpoints `PATCH /:id/move-dnd` y `PATCH /blocks/:blockId/move-dnd`.

### 4. Frontend (Iniciado)
- [x] **API Endpoints (`endpoints.js`)**: Agregadas las llamadas HTTP `moveNoteDnd` y `moveBlockDnd`.

---

## 🔴 Lo que falta por hacer (Siguientes Pasos)

### 1. Migración de BD
- [ ] **Ejecutar** el script `database/migration_dnd.sql` en la base de datos. (*Nota: el agente anterior dejó el script creado pero no corrió el comando SQL en la DB*).
- [ ] Verificar que el orden existente se mantiene ejecutando las consultas de prueba listadas en el documento de especificaciones.

### 2. Frontend - Utilidades y Hooks
- [ ] **Crear helper (`frontend/src/utils/treeManipulation.js`)**: Implementar las funciones puras `applyOptimisticNoteMove` y `applyOptimisticBlockMove` que manipulan el array/árbol en memoria sin recalcular posiciones fraccionales (eso lo hace el backend).
- [ ] **Actualizar hooks (`frontend/src/hooks/useNotes.js`)**: Implementar los custom hooks `useMoveNoteDnd` y `useMoveBlockDnd` usando `useMutation` con **optimistic updates** (`onMutate` cancelando queries previas, llamando al helper de treeManipulation y guardando snapshot para el rollback en `onError`).

### 3. Frontend - Componentes de Notas (UI)
- [ ] **Modificar `NoteTree.jsx`**: Envolver el árbol en `<DndContext>` con los sensores configurados (incluyendo `activationConstraint: { distance: 8 }`), y agregar un `<DragOverlay>` para mostrar el elemento siendo arrastrado.
- [ ] **Modificar `NoteTreeItem.jsx` (o crear `NoteNode.jsx`)**: 
  - Usar `useDraggable` para el handle de arrastre (icono `GripVertical`).
  - Implementar **tres zonas drop** superpuestas usando `useDroppable`: `above` (25% superior), `below` (25% inferior) y `center` (resto, para anidar).

### 4. Frontend - Componentes de Bloques (UI)
- [ ] **Modificar `NoteBlockList.jsx`**: Envolver la lista en `<DndContext>`.
- [ ] **Implementar DnD en Bloques**: Modificar el contenedor de cada bloque para que actúe como nodo drag and drop (con `useDraggable` y dos `useDroppable`: `above` y `below`, ya que los bloques no se anidan).

### 5. Pruebas y Limpieza
- [ ] Probar la jerarquía de notas: arrastrar arriba, abajo y al centro.
- [ ] Comprobar que los errores del backend (ej. mover una nota a su propio hijo) cancelan el drag y revierten la UI (optimistic rollback).
- [ ] Probar el drag and drop de bloques.
- [ ] Limpiar el código HTML5 DnD nativo si existía en los componentes anteriores.
