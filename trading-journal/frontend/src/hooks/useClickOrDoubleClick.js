import { useRef, useEffect, useCallback } from 'react';

// Distingue click simple de doble click sobre un mismo elemento. Devuelve un
// handler para `onClick`.
//
// No usa `onDoubleClick`: en táctil (iOS sobre todo) el `dblclick` no siempre se
// emite, así que contamos los clicks con un temporizador propio. Combinar con la
// clase `touch-manipulation` en el elemento para que el doble tap no haga zoom y
// ambos taps lleguen como click.
//
// - Segundo click dentro de `delay` ms → `onDoubleClick(e)`.
// - Sin segundo click → `onSingleClick()` al vencer el plazo (diferido: si se
//   ejecutara de inmediato, p. ej. navegando, el doble click nunca llegaría).
export const useClickOrDoubleClick = ({ onSingleClick, onDoubleClick, delay = 300 }) => {
  const timerRef = useRef(null);
  const onSingleRef = useRef(onSingleClick);
  const onDoubleRef = useRef(onDoubleClick);

  useEffect(() => {
    onSingleRef.current = onSingleClick;
    onDoubleRef.current = onDoubleClick;
  }, [onSingleClick, onDoubleClick]);

  // Cancelar el click simple pendiente al desmontar.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (e) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        onDoubleRef.current?.(e);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onSingleRef.current?.();
      }, delay);
    },
    [delay]
  );
};
