import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ListTodo, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import TodoListTabs from '../components/todo/TodoListTabs.jsx';
import TodoListView from '../components/todo/TodoListView.jsx';
import {
  useTodoLists,
  useCreateTodoList,
  useUpdateTodoList,
  useDeleteTodoList,
} from '../hooks/useTodos.js';

/**
 * Listas de pendientes. Cada item puede desplegarse en línea con contenido
 * (texto markdown e imágenes) guardado como bloques de una nota oculta.
 */
export default function Todo() {
  const { listId: listIdParam } = useParams();
  const navigate = useNavigate();
  const { data: lists = [], isLoading } = useTodoLists();
  const createList = useCreateTodoList();
  const updateList = useUpdateTodoList();
  const deleteList = useDeleteTodoList();

  const listId = listIdParam ? parseInt(listIdParam, 10) : null;
  const activeList = lists.find((l) => l.id === listId) || null;

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const skipSaveRef = useRef(false);

  // Sin lista en la URL (o una que ya no existe): ir a la primera disponible.
  useEffect(() => {
    if (isLoading || activeList) return;
    if (lists.length > 0) navigate(`/todo/${lists[0].id}`, { replace: true });
    else if (listIdParam) navigate('/todo', { replace: true });
  }, [isLoading, activeList, lists, listIdParam, navigate]);

  useEffect(() => setEditingName(false), [listId]);

  const handleCreateList = async (name) => {
    const res = await createList.mutateAsync(name);
    navigate(`/todo/${res.data.id}`);
  };

  const startEditingName = () => {
    skipSaveRef.current = false;
    setNameValue(activeList.name);
    setEditingName(true);
  };

  const saveName = () => {
    if (skipSaveRef.current) return;
    skipSaveRef.current = true;
    setEditingName(false);
    const name = nameValue.trim();
    if (name && name !== activeList.name) updateList.mutate({ listId: activeList.id, name });
  };

  const handleDeleteList = () => {
    deleteList.mutate(activeList.id, {
      onSettled: () => setConfirmDelete(false),
      onSuccess: () => navigate('/todo', { replace: true }),
    });
  };

  if (isLoading) {
    return <p className="py-24 text-center text-sm text-gray-400 dark:text-gray-500">Cargando…</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <TodoListTabs lists={lists} activeListId={activeList?.id} onCreate={handleCreateList} />

      {lists.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ListTodo className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Crea tu primera lista con <span className="font-medium">Nueva lista</span>.
          </p>
        </div>
      )}

      {activeList && (
        <>
          <div className="flex items-center gap-2 mt-4 mb-4 group">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') {
                    skipSaveRef.current = true;
                    setEditingName(false);
                  }
                }}
                maxLength={200}
                className="flex-1 min-w-0 text-2xl font-bold bg-transparent outline-none
                           border-b-2 border-blue-500 text-gray-900 dark:text-white"
                aria-label="Nombre de la lista"
              />
            ) : (
              <h1
                onDoubleClick={startEditingName}
                className="flex-1 min-w-0 truncate text-2xl font-bold text-gray-900 dark:text-white"
              >
                {activeList.name}
              </h1>
            )}
            {!editingName && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity">
                <button
                  onClick={startEditingName}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                             dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                  title="Renombrar lista"
                  aria-label="Renombrar lista"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50
                             dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                  title="Eliminar lista"
                  aria-label="Eliminar lista"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <TodoListView key={activeList.id} listId={activeList.id} />

          <ConfirmDialog
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={handleDeleteList}
            title="Eliminar lista"
            message={`Se eliminará la lista "${activeList.name}" con todos sus pendientes y su contenido.`}
            isLoading={deleteList.isPending}
          />
        </>
      )}
    </div>
  );
}
