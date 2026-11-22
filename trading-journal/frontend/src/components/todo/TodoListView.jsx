import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import TodoItem from './TodoItem.jsx';
import {
  todoKeys,
  useTodoItems,
  useCreateTodoItem,
  useUpdateTodoItem,
  useMoveTodoItem,
  useDeleteTodoItem,
} from '../../hooks/useTodos.js';

const byCompletedDesc = (a, b) => new Date(b.completed_at) - new Date(a.completed_at);

const TodoListView = ({ listId }) => {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useTodoItems(listId);
  const createItem = useCreateTodoItem(listId);
  const updateItem = useUpdateTodoItem(listId);
  const moveItem = useMoveTodoItem(listId);
  const deleteItem = useDeleteTodoItem(listId);

  const [newTitle, setNewTitle] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const pending = items.filter((it) => !it.completed_at);
  const completed = items.filter((it) => it.completed_at).sort(byCompletedDesc);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCreate = (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    createItem.mutate(title, { onSuccess: () => setNewTitle('') });
  };

  const handleToggleExpand = (itemId) => {
    // Al plegar, refrescar la lista para actualizar el indicador de contenido.
    if (expandedId !== null) qc.invalidateQueries({ queryKey: todoKeys.items(listId) });
    setExpandedId((current) => (current === itemId ? null : itemId));
  };

  const handleToggleCompleted = (item) =>
    updateItem.mutate({ itemId: item.id, completed: !item.completed_at });

  const handleRename = (item, title) => updateItem.mutate({ itemId: item.id, title });

  // Sin contenido se borra sin fricción; con contenido pide confirmación.
  const handleDelete = (item) => {
    if (item.has_content) {
      setPendingDelete(item);
      return;
    }
    deleteItem.mutate({ itemId: item.id, noteId: item.note_id });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteItem.mutate(
      { itemId: pendingDelete.id, noteId: pendingDelete.note_id },
      { onSettled: () => setPendingDelete(null) }
    );
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = pending.findIndex((it) => it.id === active.id);
    const newIndex = pending.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const dropType = newIndex > oldIndex ? 'sibling-below' : 'sibling-above';
    moveItem.mutate({ itemId: active.id, targetId: over.id, dropType });
  };

  const renderItem = (item) => (
    <TodoItem
      key={item.id}
      item={item}
      expanded={expandedId === item.id}
      onToggleExpand={handleToggleExpand}
      onToggleCompleted={handleToggleCompleted}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  );

  return (
    <div>
      <form onSubmit={handleCreate} className="flex items-center gap-2 mb-4">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Añadir pendiente…"
          maxLength={500}
          className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg
                     bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                     text-gray-900 dark:text-white placeholder:text-gray-400
                     outline-none focus:border-blue-500 dark:focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || createItem.isPending}
          className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Añadir"
          aria-label="Añadir pendiente"
        >
          <Plus className="w-5 h-5" />
        </button>
      </form>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Cargando…</p>
      ) : (
        <>
          {pending.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500 italic">
              {completed.length > 0 ? 'Todo listo — no hay pendientes.' : 'Esta lista está vacía.'}
            </p>
          )}

          {/* Los completados quedan dentro del DndContext (su useSortable está
              deshabilitado) pero fuera del SortableContext: no se reordenan. */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pending.map((it) => it.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1.5">{pending.map(renderItem)}</div>
            </SortableContext>

            {completed.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowCompleted((v) => !v)}
                  className="flex items-center gap-1.5 mb-2 text-sm font-medium
                             text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showCompleted ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Completados ({completed.length})
                </button>
                {showCompleted && <div className="flex flex-col gap-1.5">{completed.map(renderItem)}</div>}
              </div>
            )}
          </DndContext>
        </>
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar pendiente"
        message={`Se eliminará "${pendingDelete?.title}" junto con su contenido.`}
        isLoading={deleteItem.isPending}
      />
    </div>
  );
};

export default TodoListView;
