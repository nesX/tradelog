/**
 * Applies an optimistic note move on the flat API response array.
 * Does NOT recalculate fractional positions — the backend handles that.
 * Only reorders the array so `buildTree` produces the correct visual result.
 */
export function applyOptimisticNoteMoveFlat(notes, sourceId, targetId, dropType) {
  const arr = [...notes];
  const sourceIdx = arr.findIndex((n) => n.id === sourceId);
  const targetIdx = arr.findIndex((n) => n.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return notes;

  const source = { ...arr[sourceIdx] };
  const target = arr[targetIdx];

  if (dropType === 'child') {
    source.parent_note_id = targetId;
  } else {
    source.parent_note_id = target.parent_note_id;
  }

  arr.splice(sourceIdx, 1);
  const newTargetIdx = arr.findIndex((n) => n.id === targetId);

  if (dropType === 'sibling-above') {
    arr.splice(newTargetIdx, 0, source);
  } else if (dropType === 'sibling-below') {
    arr.splice(newTargetIdx + 1, 0, source);
  } else {
    arr.push(source);
  }

  return arr;
}

/**
 * Applies an optimistic block move on a flat blocks array.
 */
export function applyOptimisticBlockMove(blocks, sourceId, targetId, dropType) {
  const sourceIdx = blocks.findIndex((b) => b.id === sourceId);
  const targetIdx = blocks.findIndex((b) => b.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return blocks;

  const newBlocks = [...blocks];
  const [source] = newBlocks.splice(sourceIdx, 1);
  const newTargetIdx = newBlocks.findIndex((b) => b.id === targetId);
  const insertAt = dropType === 'sibling-above' ? newTargetIdx : newTargetIdx + 1;
  newBlocks.splice(insertAt, 0, source);
  return newBlocks;
}
