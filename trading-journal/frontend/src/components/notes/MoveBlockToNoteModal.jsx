import { useMemo, useState } from 'react';
import { FileOutput, Search, X, FileText, CornerDownRight } from 'lucide-react';
import { useNoteTree, useMoveBlockToNote } from '../../hooks/useNotes.js';
import { useToast } from '../common/Toast.jsx';

// Etiqueta legible del bloque que se va a mover (mismo criterio que el DragOverlay).
const blockLabel = (block) => {
  switch (block.block_type) {
    case 'text':
    case 'callout': {
      const text = (block.content || '').trim();
      return text ? text.slice(0, 60) + (text.length > 60 ? '…' : '') : `Bloque ${block.block_type}`;
    }
    case 'image_gallery':
      return `Galería (${(block.images || []).length} imágenes)`;
    case 'trade_reference':
      return `Trades (${(block.trades || []).length})`;
    case 'reference':
      return block.linked_note_title || block.metadata?.label || 'Referencia';
    default:
      return `Bloque ${block.block_type}`;
  }
};

// Aplana el árbol en orden de render, anotando la profundidad para indentar.
const flattenTree = (nodes, depth = 0, out = []) => {
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) flattenTree(n.children, depth + 1, out);
  }
  return out;
};

// Ids del subtree de una nota (incluyéndola) a partir de la lista plana del tree.
const subtreeIds = (flat, rootId) => {
  const childrenByParent = new Map();
  for (const n of flat) {
    if (!childrenByParent.has(n.parent_note_id)) childrenByParent.set(n.parent_note_id, []);
    childrenByParent.get(n.parent_note_id).push(n.id);
  }
  const ids = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const childId of childrenByParent.get(stack.pop()) ?? []) {
      if (!ids.has(childId)) {
        ids.add(childId);
        stack.push(childId);
      }
    }
  }
  return ids;
};

/**
 * Modal "Mover a otra nota": lista el árbol completo de notas del usuario (con
 * indentación) y un filtro por título. Excluye la nota actual, las secciones y,
 * si el bloque es una sub-nota (reference cuya nota vinculada cuelga de la nota
 * origen), su propio subtree — el backend reparenta la sub-nota automáticamente.
 */
const MoveBlockToNoteModal = ({ block, sourceNoteId, onClose }) => {
  const [query, setQuery] = useState('');
  const { data: treeData } = useNoteTree();
  const moveBlockToNote = useMoveBlockToNote(sourceNoteId);
  const toast = useToast();

  const flat = useMemo(() => treeData?.flat ?? [], [treeData]);

  // Sub-nota "real": el bloque referencia una nota cuyo padre es la nota origen.
  const isSubNote = useMemo(() => {
    if (block.block_type !== 'reference' || !block.linked_note_id) return false;
    return flat.find((n) => n.id === block.linked_note_id)?.parent_note_id === sourceNoteId;
  }, [block, flat, sourceNoteId]);

  const targets = useMemo(() => {
    const excluded = isSubNote ? subtreeIds(flat, block.linked_note_id) : new Set();
    const ordered = flattenTree(treeData?.tree ?? []);
    const valid = ordered.filter(
      (n) => n.type !== 'section' && n.id !== sourceNoteId && !excluded.has(n.id)
    );
    const q = query.trim().toLowerCase();
    if (!q) return valid;
    // Al filtrar, la jerarquía deja de tener sentido visual: lista plana de matches.
    return valid.filter((n) => n.title.toLowerCase().includes(q)).map((n) => ({ ...n, depth: 0 }));
  }, [treeData, flat, query, sourceNoteId, isSubNote, block.linked_note_id]);

  const handleConfirm = (targetNote) => {
    moveBlockToNote.mutate(
      { blockId: block.id, targetNoteId: targetNote.id },
      { onSuccess: () => toast.success(`Bloque movido a "${targetNote.title}"`) }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FileOutput className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Mover a otra nota
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Moviendo:</p>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            {blockLabel(block)}
          </p>
          {isSubNote && (
            <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
              La sub-nota vinculada también se moverá a la nota destino.
            </p>
          )}
        </div>

        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nota destino..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg
                         bg-gray-100 dark:bg-gray-700
                         text-gray-800 dark:text-gray-100
                         placeholder-gray-400 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-purple-400/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {targets.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 px-4">
              {query.trim() ? 'Sin resultados para tu búsqueda.' : 'No hay notas destino disponibles.'}
            </p>
          ) : (
            targets.map((n) => (
              <button
                key={n.id}
                onClick={() => handleConfirm(n)}
                disabled={moveBlockToNote.isPending}
                className="w-full flex items-center gap-2 px-4 py-2 text-left
                           hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors
                           disabled:opacity-50"
                style={{ paddingLeft: `${16 + n.depth * 16}px` }}
              >
                {n.depth > 0 ? (
                  <CornerDownRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                )}
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate">
                  {n.title || 'Sin título'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MoveBlockToNoteModal;
