# Implementación: Drag & Drop para Notas y Bloques

> Documento de implementación para el módulo de notas privadas del Trading Journal.
> Audiencia: agente de codificación (Claude Code) que implementará el feature.

---

## 1. Resumen y Objetivo

Implementar drag & drop dentro del módulo de notas privadas que permita:

1. **Reordenar bloques** dentro de una nota (cambiar su posición vertical).
2. **Reordenar subnotas** como hermanas dentro del mismo padre.
3. **Anidar una subnota** dentro de otra (cambiar su `parent_note_id`).

El feature debe operar **dentro del árbol de notas visible** (no entre notas raíz distintas en V1) y debe ser performante a escala de producción con múltiples usuarios concurrentes.

---

## 2. Decisiones de Diseño Confirmadas

| Decisión | Valor |
|---|---|
| Alcance V1 | Bloques + subnotas |
| Drop zones por item | 3 (arriba, centro, abajo) |
| Drop arriba | Insertar como hermano arriba del target |
| Drop abajo | Insertar como hermano abajo del target |
| Drop centro (solo notas) | Anidar como hijo del target, **al final** de sus hijos existentes |
| Profundidad máxima | Sin límite (UI puede degradar en niveles muy profundos, aceptable) |
| Cross-note moves | **Fuera de V1** — solo dentro del árbol que se está visualizando |
| Estrategia de ordenamiento | **Fractional indexing** (single-row UPDATE por movimiento) |
| Validación de ciclos | Backend con CTE recursiva (no se permite mover una nota a uno de sus descendientes) |
| Optimistic updates | Sí, en frontend con React Query |

---

## 3. Stack y Dependencias

### Backend
```bash
cd trading-journal/backend
npm install fractional-indexing
```

### Frontend
```bash
cd trading-journal/frontend
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers fractional-indexing
```

`@dnd-kit` es el reemplazo moderno de `react-beautiful-dnd` (descontinuado). Es accesible (incluye soporte por teclado), liviano, y maneja bien estructuras anidadas.

---

## 4. Migración de Base de Datos

### 4.1 Asunciones del Schema Actual

Se asume que las tablas son aproximadamente así (ajustar nombres de columna exactos según el schema real del proyecto antes de ejecutar):

```sql
-- notes: con jerarquía por parent_note_id y campo position INTEGER
-- blocks: con FK a notes y campo position INTEGER
```

Si los nombres difieren (ej: `order` en lugar de `position`, o `note_id` en lugar de `parent_note_id`), **adaptar el script de migración antes de correrlo**.

### 4.2 Script de Migración

Crear archivo: `database/migration_dnd.sql`

```sql
BEGIN;

-- =========================================================
-- 1. Cambiar position de INTEGER a TEXT en notes
-- =========================================================

ALTER TABLE notes ADD COLUMN position_new TEXT;

-- Backfill: convertir enteros a fractional keys ordenados.
-- Usamos LPAD para garantizar que el orden lexicográfico
-- coincida con el orden numérico original.
-- Ejemplo: 0 -> "a000000", 1 -> "a000001", ..., 1000 -> "a001000"
UPDATE notes
SET position_new = 'a' || LPAD(position::text, 6, '0');

ALTER TABLE notes ALTER COLUMN position_new SET NOT NULL;
ALTER TABLE notes DROP COLUMN position;
ALTER TABLE notes RENAME COLUMN position_new TO position;

-- =========================================================
-- 2. Repetir para blocks
-- =========================================================

ALTER TABLE blocks ADD COLUMN position_new TEXT;
UPDATE blocks
SET position_new = 'a' || LPAD(position::text, 6, '0');
ALTER TABLE blocks ALTER COLUMN position_new SET NOT NULL;
ALTER TABLE blocks DROP COLUMN position;
ALTER TABLE blocks RENAME COLUMN position_new TO position;

-- =========================================================
-- 3. Índices optimizados
-- =========================================================

-- Compuesto: listar siblings ordenados sin sort en memoria.
-- Partial index excluye notas borradas para mantenerlo más pequeño.
CREATE INDEX IF NOT EXISTS idx_notes_parent_position
  ON notes(parent_note_id, position)
  WHERE deleted_at IS NULL;

-- Para notas raíz por usuario (parent_note_id IS NULL).
CREATE INDEX IF NOT EXISTS idx_notes_user_root_position
  ON notes(user_id, position)
  WHERE parent_note_id IS NULL AND deleted_at IS NULL;

-- Bloques ordenados por nota.
CREATE INDEX IF NOT EXISTS idx_blocks_note_position
  ON blocks(note_id, position);

COMMIT;
```

### 4.3 Verificación post-migración

Antes de continuar, ejecutar y confirmar que el orden de los datos existentes se preserva:

```sql
-- Hijos directos de una nota
SELECT id, title, position FROM notes
WHERE parent_note_id = <some_id> AND deleted_at IS NULL
ORDER BY position ASC;

-- Bloques de una nota
SELECT id, type, position FROM blocks
WHERE note_id = <some_id>
ORDER BY position ASC;
```

Verificar visualmente que el orden coincide con lo que el usuario ve en la app actualmente.

---

## 5. Backend — Implementación

Sigue la arquitectura existente: `routes → middleware → controllers → services → repositories`.

### 5.1 Repository: `note.repository.js`

Agregar al repositorio existente:

```javascript
import { pool } from '../config/database.js';

/**
 * Obtiene todos los IDs de descendientes de una nota (recursivo).
 * Usado para validar ciclos al mover.
 *
 * @param {number} noteId - Nota raíz
 * @returns {Promise<number[]>}
 */
export async function getDescendantIds(noteId) {
  const query = `
    WITH RECURSIVE descendants AS (
      SELECT id FROM notes
      WHERE parent_note_id = $1 AND deleted_at IS NULL
      UNION ALL
      SELECT n.id FROM notes n
      INNER JOIN descendants d ON n.parent_note_id = d.id
      WHERE n.deleted_at IS NULL
    )
    SELECT id FROM descendants;
  `;
  const result = await pool.query(query, [noteId]);
  return result.rows.map(r => r.id);
}

/**
 * Busca una nota verificando propiedad del usuario.
 */
export async function findNoteByIdAndUser(noteId, userId) {
  const query = `
    SELECT id, user_id, parent_note_id, title, position
    FROM notes
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
  `;
  const result = await pool.query(query, [noteId, userId]);
  return result.rows[0] || null;
}

/**
 * Posición de la última nota hija de un padre dado.
 * Usado para anidación (drop zone center): el item se inserta al final.
 *
 * @returns {Promise<string|null>} Position string o null si el padre no tiene hijos.
 */
export async function getLastChildPosition(parentNoteId) {
  const query = `
    SELECT position FROM notes
    WHERE parent_note_id = $1 AND deleted_at IS NULL
    ORDER BY position DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [parentNoteId]);
  return result.rows[0]?.position || null;
}

/**
 * Obtiene posiciones inmediatamente antes y después de un target,
 * dentro del mismo padre. Usado para insertar como sibling.
 *
 * @param {number|null} parentNoteId - Padre destino (null = nota raíz)
 * @param {number} userId - Solo se usa si parentNoteId es null
 * @param {string} targetPosition - Posición del nodo target
 * @param {'above'|'below'} side
 * @returns {Promise<{before: string|null, after: string|null}>}
 */
export async function getSiblingPositions(parentNoteId, userId, targetPosition, side) {
  const isRoot = parentNoteId === null;
  const parentClause = isRoot
    ? 'parent_note_id IS NULL AND user_id = $2'
    : 'parent_note_id = $2';
  const parentParam = isRoot ? userId : parentNoteId;

  if (side === 'above') {
    const queryBefore = `
      SELECT position FROM notes
      WHERE ${parentClause} AND deleted_at IS NULL AND position < $1
      ORDER BY position DESC
      LIMIT 1
    `;
    const before = await pool.query(queryBefore, [targetPosition, parentParam]);
    return {
      before: before.rows[0]?.position || null,
      after: targetPosition,
    };
  } else {
    const queryAfter = `
      SELECT position FROM notes
      WHERE ${parentClause} AND deleted_at IS NULL AND position > $1
      ORDER BY position ASC
      LIMIT 1
    `;
    const after = await pool.query(queryAfter, [targetPosition, parentParam]);
    return {
      before: targetPosition,
      after: after.rows[0]?.position || null,
    };
  }
}

/**
 * Persiste el move: actualiza padre y posición.
 */
export async function updateNoteParentAndPosition(noteId, newParentId, newPosition, userId) {
  const query = `
    UPDATE notes
    SET parent_note_id = $1, position = $2, updated_at = NOW()
    WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL
    RETURNING *
  `;
  const result = await pool.query(query, [newParentId, newPosition, noteId, userId]);
  return result.rows[0] || null;
}
```

### 5.2 Repository: `block.repository.js`

```javascript
import { pool } from '../config/database.js';

/**
 * Bloque con verificación de propiedad via su nota.
 */
export async function findBlockByIdAndUser(blockId, userId) {
  const query = `
    SELECT b.id, b.note_id, b.position, b.type
    FROM blocks b
    INNER JOIN notes n ON n.id = b.note_id
    WHERE b.id = $1 AND n.user_id = $2 AND n.deleted_at IS NULL
  `;
  const result = await pool.query(query, [blockId, userId]);
  return result.rows[0] || null;
}

/**
 * Posiciones siblings dentro de la misma nota.
 * Bloques no anidan, solo se reordenan.
 */
export async function getSiblingBlockPositions(noteId, targetPosition, side) {
  if (side === 'above') {
    const before = await pool.query(`
      SELECT position FROM blocks
      WHERE note_id = $1 AND position < $2
      ORDER BY position DESC LIMIT 1
    `, [noteId, targetPosition]);
    return {
      before: before.rows[0]?.position || null,
      after: targetPosition,
    };
  } else {
    const after = await pool.query(`
      SELECT position FROM blocks
      WHERE note_id = $1 AND position > $2
      ORDER BY position ASC LIMIT 1
    `, [noteId, targetPosition]);
    return {
      before: targetPosition,
      after: after.rows[0]?.position || null,
    };
  }
}

export async function updateBlockPosition(blockId, newPosition, userId) {
  const query = `
    UPDATE blocks b
    SET position = $1, updated_at = NOW()
    FROM notes n
    WHERE b.id = $2 AND b.note_id = n.id
      AND n.user_id = $3 AND n.deleted_at IS NULL
    RETURNING b.*
  `;
  const result = await pool.query(query, [newPosition, blockId, userId]);
  return result.rows[0] || null;
}
```

### 5.3 Service: `note.service.js`

```javascript
import { generateKeyBetween } from 'fractional-indexing';
import * as noteRepo from '../repositories/note.repository.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Mueve una nota a una nueva posición/padre.
 *
 * @param {Object} params
 * @param {number} params.noteId - Nota a mover (source)
 * @param {number} params.targetId - Nota relativa al destino
 * @param {'sibling-above'|'sibling-below'|'child'} params.dropType
 * @param {number} params.userId
 * @returns {Promise<Object>} Nota actualizada
 */
export async function moveNote({ noteId, targetId, dropType, userId }) {
  // 1. Auto-referencia
  if (noteId === targetId) {
    throw new AppError('Cannot move a note onto itself', 400, 'INVALID_MOVE');
  }

  // 2. Existencia y propiedad
  const sourceNote = await noteRepo.findNoteByIdAndUser(noteId, userId);
  const targetNote = await noteRepo.findNoteByIdAndUser(targetId, userId);

  if (!sourceNote) throw new AppError('Source note not found', 404, 'NOT_FOUND');
  if (!targetNote) throw new AppError('Target note not found', 404, 'NOT_FOUND');

  // 3. Validar ciclo: el target no puede ser descendiente del source
  // (mover source dentro de su propio descendiente = ciclo)
  const descendantIds = await noteRepo.getDescendantIds(noteId);
  if (descendantIds.includes(targetId)) {
    throw new AppError(
      'Cannot move a note into one of its descendants',
      400,
      'CYCLE_DETECTED'
    );
  }

  // 4. Calcular nuevo padre y nueva posición
  let newParentId;
  let newPosition;

  if (dropType === 'child') {
    // Anidar como hijo del target -> al final de sus hijos
    newParentId = targetId;
    const lastChildPos = await noteRepo.getLastChildPosition(targetId);
    newPosition = generateKeyBetween(lastChildPos, null);
  } else {
    // Sibling: mismo padre que el target
    newParentId = targetNote.parent_note_id;
    const side = dropType === 'sibling-above' ? 'above' : 'below';
    const { before, after } = await noteRepo.getSiblingPositions(
      newParentId,
      userId,
      targetNote.position,
      side
    );
    newPosition = generateKeyBetween(before, after);
  }

  // 5. Persistir
  const updated = await noteRepo.updateNoteParentAndPosition(
    noteId,
    newParentId,
    newPosition,
    userId
  );

  if (!updated) {
    throw new AppError('Move failed', 500, 'MOVE_FAILED');
  }

  return updated;
}
```

### 5.4 Service: `block.service.js`

```javascript
import { generateKeyBetween } from 'fractional-indexing';
import * as blockRepo from '../repositories/block.repository.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Mueve un bloque dentro de su nota.
 * Bloques no anidan: solo soportan sibling-above y sibling-below.
 */
export async function moveBlock({ blockId, targetBlockId, dropType, userId }) {
  if (blockId === targetBlockId) {
    throw new AppError('Cannot move a block onto itself', 400, 'INVALID_MOVE');
  }
  if (dropType === 'child') {
    throw new AppError('Blocks cannot contain other blocks', 400, 'INVALID_MOVE');
  }

  const sourceBlock = await blockRepo.findBlockByIdAndUser(blockId, userId);
  const targetBlock = await blockRepo.findBlockByIdAndUser(targetBlockId, userId);

  if (!sourceBlock) throw new AppError('Source block not found', 404, 'NOT_FOUND');
  if (!targetBlock) throw new AppError('Target block not found', 404, 'NOT_FOUND');

  // V1: solo dentro de la misma nota
  if (sourceBlock.note_id !== targetBlock.note_id) {
    throw new AppError(
      'Cross-note block moves are not supported',
      400,
      'INVALID_MOVE'
    );
  }

  const side = dropType === 'sibling-above' ? 'above' : 'below';
  const { before, after } = await blockRepo.getSiblingBlockPositions(
    targetBlock.note_id,
    targetBlock.position,
    side
  );
  const newPosition = generateKeyBetween(before, after);

  const updated = await blockRepo.updateBlockPosition(blockId, newPosition, userId);
  if (!updated) {
    throw new AppError('Move failed', 500, 'MOVE_FAILED');
  }

  return updated;
}
```

### 5.5 Validators: `note.validator.js` / `block.validator.js`

```javascript
// note.validator.js
import Joi from 'joi';

export const moveNoteSchema = Joi.object({
  targetId: Joi.number().integer().positive().required(),
  dropType: Joi.string()
    .valid('sibling-above', 'sibling-below', 'child')
    .required(),
});

// block.validator.js
export const moveBlockSchema = Joi.object({
  targetBlockId: Joi.number().integer().positive().required(),
  dropType: Joi.string()
    .valid('sibling-above', 'sibling-below')
    .required(),
});
```

### 5.6 Controllers

```javascript
// note.controller.js
import * as noteService from '../services/note.service.js';
import { successResponse } from '../utils/response.js';

export async function moveNote(req, res) {
  const noteId = parseInt(req.params.id, 10);
  const { targetId, dropType } = req.body;
  const userId = req.user.id;

  const updated = await noteService.moveNote({
    noteId,
    targetId,
    dropType,
    userId,
  });
  return successResponse(res, updated, 'Note moved successfully');
}

// block.controller.js
import * as blockService from '../services/block.service.js';

export async function moveBlock(req, res) {
  const blockId = parseInt(req.params.id, 10);
  const { targetBlockId, dropType } = req.body;
  const userId = req.user.id;

  const updated = await blockService.moveBlock({
    blockId,
    targetBlockId,
    dropType,
    userId,
  });
  return successResponse(res, updated, 'Block moved successfully');
}
```

### 5.7 Routes

```javascript
// note.routes.js (agregar a las rutas existentes)
import { moveNoteSchema } from '../validators/note.validator.js';

router.patch(
  '/:id/move',
  authenticate,
  validate(moveNoteSchema),
  asyncHandler(noteController.moveNote)
);

// block.routes.js
import { moveBlockSchema } from '../validators/block.validator.js';

router.patch(
  '/:id/move',
  authenticate,
  validate(moveBlockSchema),
  asyncHandler(blockController.moveBlock)
);
```

### 5.8 Forma de las respuestas

**Success:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "parent_note_id": 17,
    "position": "a3V",
    "title": "...",
    "updated_at": "..."
  },
  "message": "Note moved successfully"
}
```

**Error (ciclo detectado):**
```json
{
  "success": false,
  "error": {
    "message": "Cannot move a note into one of its descendants",
    "code": "CYCLE_DETECTED"
  }
}
```

---

## 6. Frontend — Implementación

### 6.1 API endpoints

```javascript
// api/endpoints.js
export const moveNote = (noteId, payload) =>
  apiClient.patch(`/notes/${noteId}/move`, payload);

export const moveBlock = (blockId, payload) =>
  apiClient.patch(`/blocks/${blockId}/move`, payload);
```

### 6.2 React Query hooks con optimistic updates

```javascript
// hooks/useNotes.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { applyOptimisticNoteMove } from '../utils/treeManipulation.js';

export function useMoveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, targetId, dropType }) =>
      api.moveNote(noteId, { targetId, dropType }),

    onMutate: async ({ noteId, targetId, dropType }) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.tree() });
      const previousTree = queryClient.getQueryData(noteKeys.tree());

      queryClient.setQueryData(noteKeys.tree(), (old) => {
        if (!old) return old;
        return applyOptimisticNoteMove(old, noteId, targetId, dropType);
      });

      return { previousTree };
    },

    onError: (err, _vars, context) => {
      if (context?.previousTree) {
        queryClient.setQueryData(noteKeys.tree(), context.previousTree);
      }
      // Mostrar toast de error con err.response?.data?.error?.message
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
}
```

```javascript
// hooks/useBlocks.js (análogo)
export function useMoveBlock(noteId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blockId, targetBlockId, dropType }) =>
      api.moveBlock(blockId, { targetBlockId, dropType }),

    onMutate: async ({ blockId, targetBlockId, dropType }) => {
      await queryClient.cancelQueries({ queryKey: blockKeys.byNote(noteId) });
      const previous = queryClient.getQueryData(blockKeys.byNote(noteId));

      queryClient.setQueryData(blockKeys.byNote(noteId), (old) => {
        if (!old) return old;
        return applyOptimisticBlockMove(old, blockId, targetBlockId, dropType);
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(blockKeys.byNote(noteId), context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: blockKeys.byNote(noteId) });
    },
  });
}
```

### 6.3 Helpers de manipulación de árbol

```javascript
// utils/treeManipulation.js

/**
 * Mueve un nodo dentro de un árbol de notas, retornando un nuevo árbol.
 * NO recalcula fractional positions (eso lo hace el backend);
 * solo reposiciona el nodo en la estructura para el optimistic update.
 */
export function applyOptimisticNoteMove(tree, sourceId, targetId, dropType) {
  const cloned = structuredClone(tree);

  const source = removeNodeFromTree(cloned, sourceId);
  if (!source) return tree;

  if (dropType === 'child') {
    insertAsChild(cloned, targetId, source);
  } else {
    insertAsSibling(cloned, targetId, source, dropType === 'sibling-above');
  }

  return cloned;
}

function removeNodeFromTree(tree, targetId) {
  if (!tree.children) return null;
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i].id === targetId) {
      return tree.children.splice(i, 1)[0];
    }
    const found = removeNodeFromTree(tree.children[i], targetId);
    if (found) return found;
  }
  return null;
}

function findNode(tree, id) {
  if (tree.id === id) return tree;
  if (!tree.children) return null;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParentAndIndex(tree, id) {
  if (!tree.children) return null;
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i].id === id) {
      return { parent: tree, index: i };
    }
    const nested = findParentAndIndex(tree.children[i], id);
    if (nested) return nested;
  }
  return null;
}

function insertAsChild(tree, targetId, node) {
  const target = findNode(tree, targetId);
  if (!target) return;
  if (!target.children) target.children = [];
  target.children.push(node); // al final
}

function insertAsSibling(tree, targetId, node, above) {
  const result = findParentAndIndex(tree, targetId);
  if (!result) return;
  result.parent.children.splice(
    above ? result.index : result.index + 1,
    0,
    node
  );
}

/**
 * Para bloques (lista plana, no árbol).
 */
export function applyOptimisticBlockMove(blocks, sourceId, targetId, dropType) {
  const sourceIdx = blocks.findIndex(b => b.id === sourceId);
  const targetIdx = blocks.findIndex(b => b.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return blocks;

  const newBlocks = [...blocks];
  const [source] = newBlocks.splice(sourceIdx, 1);
  // Recalcular targetIdx después del splice
  const adjustedTargetIdx = newBlocks.findIndex(b => b.id === targetId);
  const insertAt = dropType === 'sibling-above' ? adjustedTargetIdx : adjustedTargetIdx + 1;
  newBlocks.splice(insertAt, 0, source);
  return newBlocks;
}
```

### 6.4 Componente: contenedor con `DndContext`

```jsx
// components/notes/NoteTreeView.jsx
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import { useState } from 'react';
import { NoteNode } from './NoteNode';
import { useMoveNote } from '../../hooks/useNotes';

export function NoteTreeView({ rootNote }) {
  const [activeId, setActiveId] = useState(null);
  const moveNoteMutation = useMoveNote();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Evita drags accidentales al hacer click
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const dropType = over.data.current?.dropType;
    const targetId = over.data.current?.noteId;
    if (!dropType || !targetId || active.id === targetId) return;

    moveNoteMutation.mutate({
      noteId: active.id,
      targetId,
      dropType,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <NoteNode note={rootNote} />
      <DragOverlay>
        {activeId ? (
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded p-2 opacity-80">
            {/* Preview simple del item arrastrado */}
            Moviendo nota...
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

### 6.5 Componente: `NoteNode` con tres drop zones

```jsx
// components/notes/NoteNode.jsx
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export function NoteNode({ note }) {
  // Draggable
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: note.id,
    data: { type: 'note' },
  });

  // Tres droppables independientes superpuestos sobre el mismo nodo
  const above = useDroppable({
    id: `above-${note.id}`,
    data: { dropType: 'sibling-above', noteId: note.id },
  });
  const below = useDroppable({
    id: `below-${note.id}`,
    data: { dropType: 'sibling-below', noteId: note.id },
  });
  const center = useDroppable({
    id: `center-${note.id}`,
    data: { dropType: 'child', noteId: note.id },
  });

  return (
    <div
      ref={setDragRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }}
      className="relative group"
    >
      {/* Drop zone superior: 25% de la altura */}
      <div
        ref={above.setNodeRef}
        className="absolute top-0 left-0 right-0 h-1/4 z-10 pointer-events-auto"
      >
        {above.isOver && (
          <div className="absolute -top-px left-0 right-0 h-0.5 bg-blue-500 rounded" />
        )}
      </div>

      {/* Drop zone inferior: 25% de la altura */}
      <div
        ref={below.setNodeRef}
        className="absolute bottom-0 left-0 right-0 h-1/4 z-10 pointer-events-auto"
      >
        {below.isOver && (
          <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-500 rounded" />
        )}
      </div>

      {/* Drop zone central + contenido visible */}
      <div
        ref={center.setNodeRef}
        className={`flex items-center gap-2 py-2 px-2 rounded transition-colors ${
          center.isOver ? 'bg-blue-100 dark:bg-blue-900/30 ring-1 ring-blue-400' : ''
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
          aria-label="Arrastrar nota"
        >
          <GripVertical size={16} />
        </button>
        <NoteContent note={note} />
      </div>

      {/* Hijos recursivamente */}
      {note.children?.length > 0 && (
        <div className="ml-4 border-l border-gray-200 dark:border-gray-700">
          {note.children.map((child) => (
            <NoteNode key={child.id} note={child} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Notas de UX:**
- El handle de drag (`GripVertical`) solo aparece en hover (`group-hover`) para no contaminar visualmente.
- Los listeners de drag van únicamente sobre el handle. Esto evita que clicks normales sobre el contenido inicien drags accidentales.
- Las drop zones son superpuestas pero no obstruyen interactividad porque las superiores/inferiores ocupan solo 25% cada una y la central queda al fondo.

### 6.6 Componente: `BlockNode`

Similar a `NoteNode` pero **sin drop zone central** (los bloques no anidan). Solo `above` y `below`. Implementación análoga, omitida por brevedad.

---

## 7. Validaciones y Edge Cases

| Caso | Capa | Comportamiento |
|---|---|---|
| Mover nota a sí misma | Backend (service) | Rechaza con `INVALID_MOVE` (400). Frontend evita mandarlo. |
| Mover nota a un descendiente | Backend (service) | CTE recursiva valida. Rechaza con `CYCLE_DETECTED` (400). |
| Drop fuera de zona válida | Frontend | dnd-kit no dispara `onDragEnd` con `over` definido → no-op. |
| Mover bloque entre notas | Backend (service) | V1 rechaza con `INVALID_MOVE`. |
| Drop en padre vacío (sin hijos) | Backend (service) | `getLastChildPosition` retorna `null` → `generateKeyBetween(null, null)` = `"a0"`. Funciona. |
| Concurrencia (dos moves simultáneos) | DB | Cada UPDATE es atómico; el último gana. Aceptable en V1. |
| Permisos | Repo | Toda query verifica `user_id`. |
| Move de nota raíz hacia sí misma como hijo | Backend | Caso degenerado de auto-referencia, ya cubierto por check de `noteId === targetId`. |

---

## 8. Consideraciones de Performance

1. **Single-row UPDATE por movimiento.** Independiente del tamaño de la lista de hermanos. Decisivo para producción.
2. **Índices compuestos** `(parent_note_id, position)` y `(note_id, position)` permiten que `ORDER BY position` con filtro por padre se resuelva con index scan, sin sort en memoria.
3. **Partial indexes** (`WHERE deleted_at IS NULL`) mantienen los índices más pequeños y rápidos.
4. **Optimistic updates en frontend**: la UI no espera el round-trip al backend para mostrar el cambio. En caso de error, rollback automático con el snapshot capturado en `onMutate`.
5. **No N+1 queries**: el árbol se carga con una sola query recursiva (asumido del sistema actual; no se modifica aquí).
6. **Activation constraint** (`distance: 8`) en el `PointerSensor` reduce drags accidentales en clicks normales — protección de UX, también ahorra requests.
7. **Rebalanceo eventual** (no requerido en V1): tras millones de moves consecutivos en el mismo punto, los strings de posición pueden crecer. Solución futura: job nocturno que renumera con LPAD spaced. No hace falta hasta que se observe el problema en métricas.

---

## 9. Plan de Implementación (orden recomendado)

1. **Migración DB**: ejecutar `migration_dnd.sql`. Verificar con queries de la sección 4.3 que el orden de los datos existentes se preserva.
2. **Instalar dependencias** (backend y frontend).
3. **Backend repositorios**: agregar los métodos nuevos en `note.repository.js` y `block.repository.js`.
4. **Backend servicios**: implementar `moveNote` y `moveBlock`.
5. **Backend validators, controllers, routes**.
6. **Probar endpoints aislados con Postman / Thunder Client / cURL** antes de tocar el frontend:
   - Mover sibling-above
   - Mover sibling-below
   - Anidar (child)
   - Intentar ciclo (debe fallar con `CYCLE_DETECTED`)
   - Intentar mover a sí misma (debe fallar con `INVALID_MOVE`)
   - Mover nota de un usuario distinto al autenticado (debe fallar con `NOT_FOUND`)
7. **Frontend hooks** con optimistic updates (`useMoveNote`, `useMoveBlock`).
8. **Frontend `NoteNode`** con tres drop zones + integración en el árbol.
9. **Frontend `DndContext`** envolviendo el árbol.
10. **Repetir 8-9 para `BlockNode`** (sin zona central).
11. **Pruebas manuales** completas según la matriz de testing (sección siguiente).

---

## 10. Testing Manual

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Arrastrar bloque arriba de otro | Línea azul superior, al soltar reordena correctamente |
| 2 | Arrastrar bloque abajo de otro | Línea azul inferior, reorden correcto |
| 3 | Arrastrar subnota al centro de otra | Highlight, anidación al final de los hijos del destino |
| 4 | Arrastrar subnota al centro de uno de sus propios descendientes | Move bloqueado por backend, toast de error |
| 5 | Arrastrar la última nota al primer lugar | Single UPDATE en DB (verificar con query log o pg_stat_statements) |
| 6 | Mover nota a un padre vacío | Funciona, queda como único hijo |
| 7 | Refresh durante drag | No corrompe datos; el drag se cancela |
| 8 | Cancelar drag (Esc / soltar fuera de zonas) | No-op, sin requests al backend |
| 9 | Performance con nota de 50+ bloques: arrastrar el último al primero | Move sigue siendo instantáneo, una sola fila actualizada en DB |
| 10 | Concurrencia: dos pestañas del mismo usuario, ambas mueven elementos | Ambas operaciones se persisten; refrescar ambas para ver el estado final |
| 11 | Click normal sobre el contenido de una nota (sin tocar el handle) | No inicia drag (gracias a `activationConstraint: { distance: 8 }`) |
| 12 | Drag con teclado (Tab al handle, Espacio, flechas) | Funciona — accesibilidad básica de `@dnd-kit` |

---

## 11. Notas Finales y Decisiones Arquitectónicas

- **Cross-note moves quedan fuera de V1.** Para mover una subnota fuera de su nota raíz hacia otra nota distinta, el flujo correcto en el futuro es un menú contextual "Mover a..." con un picker de notas, no drag & drop visual. Esto requerirá un endpoint adicional o extensión del existente.

- **Profundidad ilimitada en el data layer.** Si la UI sufre por anidación profunda en producción, la solución es **presentational** (truncar breadcrumbs, scroll horizontal en el árbol) y no requiere migración de datos.

- **Fractional indexing** se eligió sobre enteros por la criticidad de performance en producción. Beneficios: 1 UPDATE por move sin importar el tamaño de la lista, sin contención con writes simultáneos en filas de hermanos, sin riesgo de deadlocks. Costo: strings ligeramente más complejos de inspeccionar manualmente en la DB, pero la librería los mantiene cortos.

- **Si en el futuro se implementa colaboración en tiempo real** (múltiples usuarios editando la misma nota simultáneamente), fractional indexing ya es la base correcta — solo habría que agregar broadcasting de cambios via WebSocket. Decisión aprovechada hoy aunque el caso de uso aún no exista.

- **Tests automatizados**: este documento no los incluye explícitamente, pero el agente debería agregar tests de integración en `backend/tests/` para los endpoints de move (especialmente el caso de ciclo, que es la lógica más sutil).

- **Logs**: registrar con Winston (siguiendo el patrón actual del proyecto) cada move exitoso y cada error de validación. Útil para debugging en producción.



Here's a summary of everything implemented:

DB migration (you need to run it): migration_dnd.sql converts notes.position and note_blocks.position from INTEGER to TEXT fractional indexing format, then creates optimized compound indexes.

Backend fixes (in note.repository.js):

create(): now uses generateKeyBetween instead of MAX + 1 integer arithmetic
createBlock(): computes fractional key from surrounding positions based on the integer index from the frontend
reorderSiblings() and reorderBlocks(): generate sequential fractional keys instead of integers
Frontend (all new):

treeManipulation.js — optimistic update helpers for flat-array notes and block arrays
useNotes.js — useMoveNoteDnd and useMoveBlockDnd hooks with optimistic updates + rollback
NoteTree.jsx — replaced HTML5 DnD with @dnd-kit/core DndContext, pointerWithin collision detection, DragOverlay
NoteTreeItem.jsx — useDraggable on grip handle + 3 non-overlapping useDroppable zones (25% above → sibling-above, 50% center → child/nest, 25% below → sibling-below)
NoteBlockList.jsx — @dnd-kit/sortable with SortableContext, grip handle per block, keeps existing up/down arrows
Notes.jsx — removed onReorder / useReorderNotes (DnD is now fully internal to NoteTree)


