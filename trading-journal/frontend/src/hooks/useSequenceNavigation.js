import { useState, useEffect, useCallback, useRef } from 'react';
import { keyToAction, clampIndex } from '../utils/sequenceNavigation.js';

/**
 * Navegación adelante/atrás por una secuencia de longitud fija, sin dar la vuelta
 * al llegar a un extremo, con teclado: ←/→ navegan y Esc llama a `onExit`.
 *
 * El teclado se ignora con el foco en un campo editable (input, textarea,
 * [contenteditable]) o con `enabled = false` (p. ej. un picker o un lightbox
 * abiertos, que usan esas mismas teclas).
 *
 * El modal de detalle de trades no lo usa: su navegación cruza páginas del
 * servidor y no tiene teclado (ver task 038).
 *
 * @returns {{ index, setIndex, next, prev, hasNext, hasPrev }}
 */
export function useSequenceNavigation({ length, initialIndex = 0, onExit, enabled = true }) {
  const [index, setIndex] = useState(() => clampIndex(initialIndex, length));
  const hasPrev = index > 0;
  const hasNext = index < length - 1;

  const next = useCallback(() => setIndex((i) => clampIndex(i + 1, length)), [length]);
  const prev = useCallback(() => setIndex((i) => clampIndex(i - 1, length)), [length]);

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (e) => {
      if (e.defaultPrevented) return;
      const action = keyToAction(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'next') next();
      else if (action === 'prev') prev();
      else onExitRef.current?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, next, prev]);

  return { index, setIndex, next, prev, hasNext, hasPrev };
}
