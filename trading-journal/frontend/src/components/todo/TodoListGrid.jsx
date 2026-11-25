import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Circle, CheckCircle2 } from 'lucide-react';

const CARD_BASE = 'flex flex-col min-h-[11rem] rounded-xl border p-4 transition-all';

/**
 * Card de una lista: nombre, contador y vista previa de sus primeros pendientes.
 */
const TodoListCard = ({ list }) => {
  const preview = list.preview_items || [];
  const remaining = list.pending_count - preview.length;

  return (
    <Link
      to={`/todo/${list.id}`}
      className={`${CARD_BASE} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700
                  hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md`}
    >
      <div className="flex items-start gap-2 mb-3">
        <h2 className="flex-1 min-w-0 truncate font-semibold text-gray-900 dark:text-white">
          {list.name}
        </h2>
        {list.pending_count > 0 && (
          <span
            className="flex-shrink-0 min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-medium text-center
                       bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
          >
            {list.pending_count}
          </span>
        )}
      </div>

      {preview.length > 0 ? (
        <ul className="space-y-1.5">
          {preview.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Circle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />
              <span className="min-w-0 truncate">{item.title}</span>
            </li>
          ))}
          {remaining > 0 && (
            <li className="pl-[1.375rem] text-xs text-gray-600 dark:text-gray-300">+{remaining} más</li>
          )}
        </ul>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
          <CheckCircle2 className="w-6 h-6 text-gray-300 dark:text-gray-600" />
          Sin pendientes
        </div>
      )}
    </Link>
  );
};

/**
 * Cuadrícula de listas (3 por fila en escritorio) + card para crear una lista inline.
 * `onCreate(name)` debe devolver una promesa; al resolverse se cierra el input.
 */
const TodoListGrid = ({ lists, onCreate }) => {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {lists.map((list) => (
        <TodoListCard key={list.id} list={list} />
      ))}

      {adding ? (
        <form
          onSubmit={handleSubmit}
          className={`${CARD_BASE} justify-center border-blue-500 bg-white dark:bg-gray-800`}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            maxLength={200}
            placeholder="Nombre de la lista"
            className="w-full px-1 py-1 text-base font-semibold bg-transparent outline-none
                       border-b-2 border-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">Enter para crear · Esc para cancelar</p>
        </form>
      ) : (
        <button
          onClick={open}
          className={`${CARD_BASE} items-center justify-center gap-2 border-dashed border-gray-300 dark:border-gray-600
                      text-gray-500 hover:text-blue-600 hover:border-blue-400
                      dark:text-gray-400 dark:hover:text-blue-400 dark:hover:border-blue-500`}
        >
          <Plus className="w-6 h-6" />
          <span className="text-sm font-medium">Nueva lista</span>
        </button>
      )}
    </div>
  );
};

export default TodoListGrid;
