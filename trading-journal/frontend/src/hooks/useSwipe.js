import { useRef } from 'react';

/**
 * Detecta un swipe / arrastre horizontal (touch, mouse o pen) sobre un elemento.
 *
 * Usa Pointer Events, así que funciona igual con el dedo en una tablet que
 * arrastrando con el mouse en desktop. Devuelve props para hacer spread en el
 * contenedor sobre el que se quiere capturar el gesto:
 *
 *   const swipe = useSwipe({ onSwipeLeft: next, onSwipeRight: prev });
 *   <div {...swipe} className="touch-pan-y select-none"> … </div>
 *
 * @param {Object}   opts
 * @param {Function} opts.onSwipeLeft   - swipe hacia la izquierda (dedo va a la izq) → normalmente "siguiente".
 * @param {Function} opts.onSwipeRight  - swipe hacia la derecha → normalmente "anterior".
 * @param {number}   [opts.threshold=50] - distancia horizontal mínima (px) para contar como swipe.
 */
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 } = {}) {
  const start = useRef(null);
  const didSwipe = useRef(false);

  const onPointerDown = (e) => {
    // Solo botón primario cuando es mouse (ignora click derecho / medio).
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    didSwipe.current = false;
    // Capturar el puntero para seguir recibiendo eventos aunque el dedo/cursor
    // salga del elemento a mitad del gesto.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* setPointerCapture puede no estar disponible; el gesto sigue funcionando */
    }
  };

  const onPointerUp = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    // Debe ser un gesto predominantemente horizontal y superar el umbral.
    if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) {
      didSwipe.current = true;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    }
  };

  const onPointerCancel = () => {
    start.current = null;
  };

  // Evita que el "click" sintético que sigue a un swipe dispare acciones del
  // elemento (p. ej. abrir/cerrar pantalla completa al deslizar la imagen).
  const onClickCapture = (e) => {
    if (didSwipe.current) {
      e.stopPropagation();
      e.preventDefault();
      didSwipe.current = false;
    }
  };

  return { onPointerDown, onPointerUp, onPointerCancel, onClickCapture };
}

export default useSwipe;
