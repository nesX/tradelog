import { useEffect, useMemo, useState } from 'react';
import { FileOutput, Search, X, FileText, ChevronRight } from 'lucide-react';
import { useNoteTree, useMoveBlockToNote } from '../../hooks/useNotes.js';
import { useToast } from '../common/Toast.jsx';
import { groupBySections } from '../../utils/notesGrouping.js';

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
    case 'image':
      return 'Imagen';
    case 'trade_reference':
      return `Trades (${(block.trades || []).length})`;
    case 'reference':
      return block.linked_note_title || block.metadata?.label || 'Referencia';
    default:
      return `Bloque ${block.block_type}`;
  }
};

// Reordena recursivamente las sub-notas según la posición de su bloque 'reference'
// dentro de la nota padre (parent_block_position, fractional index comparable como
// string) para que el modal muestre el mismo orden que se ve dentro de la nota.
// Las sub-notas sin bloque van al final conservando el orden del árbol (sort estable).
// En el nivel raíz todas tienen parent_block_position null → queda el orden del árbol.
const sortByInNoteOrder = (nodes) =>
  [...nodes]
    .sort((a, b) => {
      if (a.parent_block_position == null || b.parent_block_position == null) {
        return (a.parent_block_position == null) - (b.parent_block_position == null);
      }
      return a.parent_block_position < b.parent_block_position ? -1 : 1;
    })
    .map((n) => (n.children?.length ? { ...n, children: sortByInNoteOrder(n.children) } : n));

// Aplana el árbol en orden de render (para el modo búsqueda).
const flattenTree = (nodes, out = []) => {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenTree(n.children, out);
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
 * Modal "Mover a otra nota": replica la navegación del árbol lateral (secciones,
 * expandir/colapsar con chevron). Todo arranca colapsado; seleccionar una nota
 * con sub-notas la expande para seguir navegando. Un clic solo SELECCIONA la
 * nota destino; el movimiento se confirma con el botón "Mover a nota" del pie —
 * así se evitan movimientos accidentales.
 *
 * No seleccionables (grises, pero visibles para no romper la jerarquía): la nota
 * actual y, si el bloque es una sub-nota (reference cuya nota vinculada cuelga de
 * la nota origen), todo su subtree — el backend reparenta la sub-nota automáticamente.
 */
const MoveBlockToNoteModal = ({ block, sourceNoteId, onClose }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const { data: treeData, refetch } = useNoteTree();
  const moveBlockToNote = useMoveBlockToNote(sourceNoteId);
  const toast = useToast();

  // Refrescar el árbol al abrir: garantiza que una nota recién eliminada (o
  // restaurada) en otra vista no aparezca/desaparezca con datos cacheados viejos.
  useEffect(() => {
    refetch();
  }, [refetch]);

  const flat = useMemo(() => treeData?.flat ?? [], [treeData]);

  // Sub-nota "real": el bloque referencia una nota cuyo padre es la nota origen.
  const isSubNote = useMemo(() => {
    if (block.block_type !== 'reference' || !block.linked_note_id) return false;
    return flat.find((n) => n.id === block.linked_note_id)?.parent_note_id === sourceNoteId;
  }, [block, flat, sourceNoteId]);

  // Ids que no pueden ser destino: la nota origen y, si aplica, el subtree de la sub-nota.
  const disabledIds = useMemo(() => {
    const ids = isSubNote ? subtreeIds(flat, block.linked_note_id) : new Set();
    ids.add(sourceNoteId);
    return ids;
  }, [flat, sourceNoteId, isSubNote, block.linked_note_id]);

  const tree = useMemo(() => sortByInNoteOrder(treeData?.tree ?? []), [treeData]);

  // Modo búsqueda: lista plana de matches seleccionables (la jerarquía deja de
  // tener sentido visual al filtrar).
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return flattenTree(tree).filter(
      (n) => n.type !== 'section' && !disabledIds.has(n.id) && n.title.toLowerCase().includes(q)
    );
  }, [tree, query, disabledIds]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Seleccionar una nota con sub-notas también la expande (navegación con menos clics).
  const selectNote = (note) => {
    setSelected(note);
    if (note.children?.length) {
      setExpandedIds((prev) => new Set(prev).add(note.id));
    }
  };

  const handleConfirm = () => {
    if (!selected) return;
    moveBlockToNote.mutate(
      { blockId: block.id, targetNoteId: selected.id },
      { onSuccess: () => toast.success(`Bloque movido a "${selected.title}"`) }
    );
    onClose();
  };

  const renderRow = (note, depth) => {
    const isDisabled = disabledIds.has(note.id);
    const isSelected = selected?.id === note.id;
    const hasChildren = note.children?.length > 0;
    const isExpanded = expandedIds.has(note.id);

    return (
      <div key={note.id}>
        <div
          onClick={() => !isDisabled && selectNote(note)}
          className={`group flex items-center gap-1 select-none transition-colors
            ${isDisabled
              ? 'cursor-default text-gray-300 dark:text-gray-600'
              : isSelected
              ? 'cursor-pointer bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
              : 'cursor-pointer text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20'
            }`}
          style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px', paddingTop: '5px', paddingBottom: '5px' }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(note.id);
            }}
            className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors
              ${hasChildren ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200' : 'invisible'}`}
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>
          <span className="flex-1 truncate text-sm" title={note.title}>
            {note.title || 'Sin título'}
          </span>
          {isDisabled && note.id === sourceNoteId && (
            <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
              nota actual
            </span>
          )}
        </div>
        {hasChildren && isExpanded && <div>{note.children.map((c) => renderRow(c, depth + 1))}</div>}
      </div>
    );
  };

  const groups = groupBySections(tree);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[75vh]">
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
          {searchResults ? (
            searchResults.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 px-4">
                Sin resultados para tu búsqueda.
              </p>
            ) : (
              searchResults.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelected(n)}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-left transition-colors
                    ${selected?.id === n.id
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                      : 'text-gray-800 dark:text-gray-100 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                    }`}
                >
                  <FileText className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="text-sm truncate">{n.title || 'Sin título'}</span>
                </button>
              ))
            )
          ) : tree.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 px-4">
              No hay notas destino disponibles.
            </p>
          ) : (
            groups.map((group, idx) => {
              if (group.section === null) {
                if (group.items.length === 0) return null;
                return <div key={`ungrouped-${idx}`}>{group.items.map((n) => renderRow(n, 0))}</div>;
              }
              return (
                <div key={group.section.id}>
                  <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">
                      {group.section.title}
                    </span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                  {group.items.map((n) => renderRow(n, 0))}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || moveBlockToNote.isPending}
            className="flex items-center gap-2 max-w-[60%] px-3 py-1.5 text-sm font-medium rounded-lg
                       bg-purple-600 text-white hover:bg-purple-700 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileOutput className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {selected ? `Mover a "${selected.title || 'Sin título'}"` : 'Mover a nota'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveBlockToNoteModal;
