// Lógica pura de la navegación por una secuencia fija (visor de repaso de
// bloques): qué hace cada tecla y cuándo hay que ignorarla. Sin window/document:
// lo prueba `node --test` (sequenceNavigation.test.js).

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** ¿El foco está en un campo donde las flechas y Esc son del usuario? */
export const isEditableTarget = (target) =>
  Boolean(target && (target.isContentEditable || target.closest?.(EDITABLE_SELECTOR)));

/**
 * Acción de una tecla: 'next' | 'prev' | 'exit' | null. Con modificadores o
 * dentro de un campo editable no hace nada.
 */
export const keyToAction = (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (isEditableTarget(event.target)) return null;
  if (event.key === 'ArrowRight') return 'next';
  if (event.key === 'ArrowLeft') return 'prev';
  if (event.key === 'Escape') return 'exit';
  return null;
};

/** Índice dentro de [0, length - 1], sin dar la vuelta (0 si la secuencia está vacía). */
export const clampIndex = (index, length) => Math.min(Math.max(0, index), Math.max(0, length - 1));
