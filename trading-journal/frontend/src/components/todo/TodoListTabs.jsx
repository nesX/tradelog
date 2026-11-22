import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

/**
 * Selector de listas (chips con scroll horizontal) + creación inline de lista.
 * `onCreate(name)` debe devolver una promesa; al resolverse se cierra el input.
 */
const TodoListTabs = ({ lists, activeListId, onCreate }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // Enter y blur llegan ambos a handleSubmit: el ref evita crear la lista dos
  // veces, y que Escape (que desmonta el input y dispara blur) la cree.
  const skipSubmitRef = useRef(false);

  const close = () => {
    skipSubmitRef.current = true;
    setAdding(false);
    setName('');
  };

  const open = () => {
    skipSubmitRef.current = false;
    setAdding(true);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (skipSubmitRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) return close();
    skipSubmitRef.current = true;
    try {
      await onCreate(trimmed);
      close();
    } catch {
      // El toast global de mutaciones ya informa el error; se puede reintentar.
      skipSubmitRef.current = false;
    }
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {lists.map((list) => {
        const active = list.id === activeListId;
        return (
          <Link
            key={list.id}
            to={`/todo/${list.id}`}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${active
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
          >
            {list.name}
            {list.pending_count > 0 && (
              <span
                className={`min-w-[1.25rem] px-1 rounded-full text-xs text-center
                  ${active
                    ? 'bg-blue-100 dark:bg-blue-800/60'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
              >
                {list.pending_count}
              </span>
            )}
          </Link>
        );
      })}

      {adding ? (
        <form onSubmit={handleSubmit} className="flex-shrink-0">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            maxLength={200}
            placeholder="Nombre de la lista"
            className="w-44 px-3 py-1.5 text-sm rounded-full outline-none
                       bg-white dark:bg-gray-800 border border-blue-500
                       text-gray-900 dark:text-white placeholder:text-gray-400"
          />
        </form>
      ) : (
        <button
          onClick={open}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
                     text-gray-500 hover:bg-gray-100 hover:text-gray-700
                     dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva lista
        </button>
      )}
    </div>
  );
};

export default TodoListTabs;
