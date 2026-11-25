import { useEffect, useRef } from 'react';

/**
 * Avisa a `onChange(open)` cada vez que cambia `open`, sin depender de la
 * identidad del callback. Los bloques en solo lectura lo usan para decirle al
 * visor de repaso que abrieron su lightbox (y que el teclado es del lightbox).
 */
export function useReportOpen(open, onChange) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.(open);
  }, [open]);
}
