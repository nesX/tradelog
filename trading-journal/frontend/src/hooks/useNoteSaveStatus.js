import { useIsMutating, useMutationState } from '@tanstack/react-query';
import { noteKeys } from './useNotes.js';

/**
 * Estado de guardado agregado a nivel nota, para un indicador único estilo
 * Notion/Docs. Se apoya en que TODAS las mutaciones de notas comparten el prefijo
 * de `mutationKey` `noteKeys.all` (['notes', ...]):
 *
 *  - Alguna mutación en vuelo  → 'saving'  ("Guardando…")
 *  - Ninguna en vuelo, la última terminó OK → 'saved' ("Todos los cambios guardados")
 *  - La última terminó en error → 'error'  ("Error al guardar")
 *  - Sin mutaciones recientes en caché → 'idle' (no se muestra nada)
 *
 * `useIsMutating`/`useMutationState` hacen matching por prefijo del mutationKey de
 * forma nativa, así que basta etiquetar cada mutación con ese prefijo.
 */
export function useNoteSaveStatus() {
  const pending = useIsMutating({ mutationKey: noteKeys.all });

  const settled = useMutationState({
    filters: { mutationKey: noteKeys.all },
    select: (m) => ({ status: m.state.status, submittedAt: m.state.submittedAt }),
  });

  if (pending > 0) return { status: 'saving' };
  if (settled.length === 0) return { status: 'idle' };

  // La mutación resuelta más reciente marca el estado persistente.
  const latest = settled.reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a));
  if (latest.status === 'error') return { status: 'error', at: latest.submittedAt };
  if (latest.status === 'success') return { status: 'saved', at: latest.submittedAt };
  return { status: 'idle' };
}
