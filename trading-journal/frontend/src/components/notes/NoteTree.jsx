import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import NoteTreeItem from './NoteTreeItem.jsx';
import SectionDivider from './SectionDivider.jsx';
import { useMoveNoteDnd } from '../../hooks/useNotes.js';
import { groupBySections } from '../../utils/notesGrouping.js';

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

const findNodeInTree = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findNodeInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

// 15% arriba → sibling-above, 15% abajo → sibling-below, 70% centro → child
const computeZone = (pointerY, rect) => {
  const ratio = (pointerY - rect.top) / rect.height;
  if (ratio < 0.15) return 'sibling-above';
  if (ratio > 0.85) return 'sibling-below';
  return 'child';
};

const renderNotes = (nodes, depth, props) =>
  nodes.map((note) => (
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
      onMove={props.onMove}
      overInfo={props.overInfo}
    >
      {note.children?.length > 0 ? renderNotes(note.children, depth + 1, props) : null}
    </NoteTreeItem>
  ));

const NoteTree = ({ notes = [], selectedNoteId, onSelect, onCreateChild, onDelete, onMove, onRenameSection, onDeleteSection }) => {
  const [expandedIds, setExpandedIds] = useState(loadExpanded);
  const [activeNote, setActiveNote] = useState(null);
  const [overInfo, setOverInfo] = useState({ noteId: null, zone: null });
  const moveNote = useMoveNoteDnd();

  useEffect(() => {
    saveExpanded(expandedIds);
  }, [expandedIds]);

  const toggle = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ active }) => {
    setActiveNote(findNodeInTree(notes, active.id));
    setOverInfo({ noteId: null, zone: null });
  };

  const handleDragMove = ({ activatorEvent, delta, active, over }) => {
    if (!over?.data.current?.noteId) {
      setOverInfo({ noteId: null, zone: null });
      return;
    }
    const noteId = over.data.current.noteId;
    const pointerY = activatorEvent.clientY + delta.y;
    let zone = computeZone(pointerY, over.rect);

    // Sections can't be parents — convert 'child' drop to 'sibling-below'
    if (over.data.current?.type === 'section' && zone === 'child') zone = 'sibling-below';
    // Sections can only live at root level — they can't be children of anything
    if (active.data.current?.type === 'section' && zone === 'child') zone = 'sibling-below';

    setOverInfo({ noteId, zone });
  };

  const handleDragEnd = ({ activatorEvent, delta, active, over }) => {
    setActiveNote(null);
    setOverInfo({ noteId: null, zone: null });

    if (!over?.data.current?.noteId) return;
    const targetId = over.data.current.noteId;
    if (active.id === targetId) return;

    const pointerY = activatorEvent.clientY + delta.y;
    let dropType = computeZone(pointerY, over.rect);

    // Apply same section constraints before firing the mutation
    if (over.data.current?.type === 'section' && dropType === 'child') dropType = 'sibling-below';
    if (active.data.current?.type === 'section' && dropType === 'child') dropType = 'sibling-below';

    moveNote.mutate({ noteId: active.id, targetId, dropType });
  };

  const handleDragCancel = () => {
    setActiveNote(null);
    setOverInfo({ noteId: null, zone: null });
  };

  const treeProps = {
    expandedIds,
    selectedNoteId,
    onToggle: toggle,
    onSelect,
    onCreateChild,
    onDelete,
    onMove,
    overInfo,
  };

  const groups = groupBySections(notes);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div>
        {groups.map((group, idx) => {
          if (group.section === null) {
            if (group.items.length === 0) return null;
            return (
              <div key={`ungrouped-${idx}`}>
                {renderNotes(group.items, 0, treeProps)}
              </div>
            );
          }
          return (
            <SectionDivider
              key={group.section.id}
              section={group.section}
              itemCount={group.items.length}
              overInfo={overInfo}
              onRename={onRenameSection}
              onDelete={onDeleteSection}
            >
              {renderNotes(group.items, 0, treeProps)}
            </SectionDivider>
          );
        })}
      </div>
      <DragOverlay>
        {activeNote ? (
          <div className="bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 shadow-lg rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 opacity-90 cursor-grabbing max-w-[220px] truncate">
            {activeNote.title || 'Sin título'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default NoteTree;
