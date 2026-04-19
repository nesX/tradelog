import { useState, useEffect, useCallback, useRef } from 'react';
import NoteTreeItem from './NoteTreeItem.jsx';

const STORAGE_KEY = 'note_tree_expanded';

const loadExpanded = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const saveExpanded = (set) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
};

const renderTree = (nodes, depth, props) => {
  return nodes.map((note) => (
    <NoteTreeItem
      key={note.id}
      note={note}
      depth={depth}
      isExpanded={props.expandedIds.has(note.id)}
      isSelected={props.selectedNoteId === note.id}
      onToggle={() => props.onToggle(note.id)}
      onSelect={() => props.onSelect(note.id)}
      onCreateChild={props.onCreateChild}
      onDelete={props.onDelete}
      isDragging={props.dragId === note.id}
      isDragOver={props.overId === note.id}
      dragPosition={props.overId === note.id ? props.dragPosition : null}
      onDragStart={() => props.onDragStart(note)}
      onDragOver={(e, pos) => props.onDragOver(e, note, pos)}
      onDrop={(e, pos) => props.onDrop(e, note, nodes, pos)}
      onDragEnd={props.onDragEnd}
    >
      {note.children && note.children.length > 0
        ? renderTree(note.children, depth + 1, props)
        : null}
    </NoteTreeItem>
  ));
};

const NoteTree = ({ notes = [], flat = [], selectedNoteId, onSelect, onCreateChild, onDelete, onReorder }) => {
  const [expandedIds, setExpandedIds] = useState(loadExpanded);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [dragPosition, setDragPosition] = useState('below');

  useEffect(() => {
    saveExpanded(expandedIds);
  }, [expandedIds]);

  const toggle = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDragStart = useCallback((note) => {
    setDragId(note.id);
  }, []);

  const handleDragOver = useCallback((e, note, position) => {
    e.preventDefault();
    if (note.id === dragId) return;
    setOverId(note.id);
    setDragPosition(position);
  }, [dragId]);

  const handleDrop = useCallback((e, targetNote, siblings, position) => {
    e.preventDefault();
    const dragged = siblings.find((n) => n.id === dragId);
    if (!dragged || dragId === targetNote.id) {
      setDragId(null);
      setOverId(null);
      return;
    }

    const filtered = siblings.filter((n) => n.id !== dragId);
    const targetIdx = filtered.findIndex((n) => n.id === targetNote.id);
    const insertIdx = position === 'above' ? targetIdx : targetIdx + 1;
    filtered.splice(insertIdx, 0, dragged);

    onReorder(filtered.map((n) => n.id));
    setDragId(null);
    setOverId(null);
  }, [dragId, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setOverId(null);
  }, []);

  const treeProps = {
    expandedIds,
    selectedNoteId,
    onToggle: toggle,
    onSelect,
    onCreateChild,
    onDelete,
    dragId,
    overId,
    dragPosition,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
  };

  return (
    <div className="space-y-0.5">
      {renderTree(notes, 0, treeProps)}
    </div>
  );
};

export default NoteTree;
