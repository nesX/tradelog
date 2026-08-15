import { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Plus,
  Flag,
  BookMarked,
  Link2,
  FileOutput,
  Trash2,
} from 'lucide-react';
import { useBlockInserter, BLOCK_OPTIONS } from '../../hooks/useBlockInserter.js';
import { useToggleFollowUp } from '../../hooks/useBlockFollowUp.js';
import { useToggleRevisit } from '../../hooks/useBlockRevisit.js';
import { useToast } from '../common/Toast.jsx';
import { buildBlockUrl } from '../../utils/referenceLinks.js';

/**
 * Alternativa táctil (tablet/móvil) a los controles flotantes de bloque:
 * un único botón "⋮" sin fondo en el margen izquierdo del bloque (misma
 * posición que el "+" de desktop), centrado verticalmente vía `topClass`.
 *
 * - Tap: despliega un menú con todas las acciones (insertar debajo,
 *   seguimiento, copiar referencia, mover a otra nota, eliminar).
 * - Mantener pulsado: arrastra el bloque (recibe los `dragListeners` de
 *   dnd-kit; el TouchSensor con delay de 250ms distingue tap de arrastre).
 *
 * Solo visible en dispositivos sin hover (variante `touch:`); en desktop
 * siguen los controles flotantes de siempre.
 */
const BlockTouchMenu = ({ block, noteId, position, onOpenMove, onDelete, dragListeners, topClass = 'top-1/2' }) => {
  const [open, setOpen] = useState(false);
  // 'actions' (menú principal) | 'insert' (tipos de bloque a insertar)
  const [view, setView] = useState('actions');
  const ref = useRef(null);
  const toast = useToast();
  const { insert, loading: inserting } = useBlockInserter(noteId);
  const toggleFollowUp = useToggleFollowUp();
  const toggleRevisit = useToggleRevisit();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setView('actions');
  };

  const handleToggleOpen = (e) => {
    e.stopPropagation();
    setView('actions');
    setOpen((v) => !v);
  };

  const handleInsert = async (type) => {
    closeMenu();
    await insert(type, position);
  };

  const handleFollowUp = () => {
    closeMenu();
    toggleFollowUp.mutate({
      blockId: block.id,
      requiresFollowUp: !block.requires_follow_up,
      noteId,
    });
  };

  const handleRevisit = () => {
    closeMenu();
    toggleRevisit.mutate({
      blockId: block.id,
      markedForRevisit: !block.marked_for_revisit,
    });
  };

  const handleCopyReference = async () => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(buildBlockUrl(noteId, block.id));
      toast.success('Referencia copiada');
    } catch {
      toast.error('No se pudo copiar la referencia');
    }
  };

  const itemClass = `flex items-center gap-2.5 w-full px-3 py-2.5
                     text-sm text-gray-700 dark:text-gray-200
                     hover:bg-gray-50 dark:hover:bg-gray-700/60
                     transition-colors`;

  return (
    // z-30 con el menú abierto para que quede por encima de los botones "⋮"
    // de los bloques vecinos (todos comparten nivel z-10 cuando están cerrados).
    <div
      ref={ref}
      className={`hidden touch:block absolute -left-6 ${topClass} -translate-y-1/2 ${open ? 'z-30' : 'z-10'}`}
    >
      <button
        {...dragListeners}
        onClick={handleToggleOpen}
        className="w-7 h-7 flex items-center justify-center rounded
                   text-gray-400 touch-none opacity-60
                   active:opacity-100 active:text-gray-700 dark:active:text-gray-200"
        title="Acciones del bloque (mantén pulsado para arrastrar)"
        aria-label="Acciones del bloque"
      >
        {inserting ? (
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <MoreVertical className="w-4 h-4" />
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-30
                     bg-white dark:bg-gray-800
                     border border-gray-200 dark:border-gray-700
                     rounded-xl shadow-lg overflow-hidden min-w-[190px]"
        >
          {view === 'actions' ? (
            <>
              <p className="px-3 pt-2 pb-1 text-[11px] text-gray-400 dark:text-gray-500 select-none">
                Mantén pulsado ⋮ para arrastrar
              </p>
              <button onClick={() => setView('insert')} className={itemClass}>
                <Plus className="w-4 h-4 text-blue-500" />
                <span className="flex-1 text-left">Insertar debajo</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button onClick={handleFollowUp} className={itemClass}>
                <Flag
                  className="w-4 h-4 text-amber-500"
                  fill={block.requires_follow_up ? 'currentColor' : 'none'}
                />
                {block.requires_follow_up ? 'Resolver seguimiento' : 'Marcar seguimiento'}
              </button>
              <button onClick={handleRevisit} className={itemClass}>
                <BookMarked
                  className="w-4 h-4 text-blue-500"
                  fill={block.marked_for_revisit ? 'currentColor' : 'none'}
                />
                {block.marked_for_revisit ? 'Quitar repaso' : 'Marcar repaso'}
              </button>
              {block.block_type !== 'reference' && (
                <button onClick={handleCopyReference} className={itemClass}>
                  <Link2 className="w-4 h-4 text-blue-500" />
                  Copiar referencia
                </button>
              )}
              <button
                onClick={() => {
                  closeMenu();
                  onOpenMove(block.id);
                }}
                className={itemClass}
              >
                <FileOutput className="w-4 h-4 text-purple-500" />
                Mover a otra nota
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  onDelete(block);
                }}
                className={`${itemClass} text-red-500 dark:text-red-400
                            hover:bg-red-50 dark:hover:bg-red-900/30`}
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setView('actions')}
                className={`${itemClass} border-b border-gray-100 dark:border-gray-700/60
                            text-gray-500 dark:text-gray-400`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Volver
              </button>
              {BLOCK_OPTIONS.map(({ type, label, icon: Icon, color }) => (
                <button key={type} onClick={() => handleInsert(type)} className={itemClass}>
                  <Icon className={`w-4 h-4 ${color}`} />
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BlockTouchMenu;
