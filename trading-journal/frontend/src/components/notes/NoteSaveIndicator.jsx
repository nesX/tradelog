import { Check, Loader2, AlertTriangle } from 'lucide-react';
import { useNoteSaveStatus } from '../../hooks/useNoteSaveStatus.js';

const formatTime = (ms) =>
  ms ? new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Indicador único de guardado a nivel nota (título, tags, bloques, callouts,
 * metadata de galería, follow-up…). Texto pequeño y discreto en la cabecera del
 * editor. El detalle del error lo da el toast global; aquí basta el estado.
 */
const NoteSaveIndicator = () => {
  const { status, at } = useNoteSaveStatus();

  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 select-none whitespace-nowrap">
        <Loader2 className="w-3 h-3 animate-spin" />
        Guardando…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500 dark:text-red-400 select-none whitespace-nowrap">
        <AlertTriangle className="w-3 h-3" />
        Error al guardar
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 select-none whitespace-nowrap">
      <Check className="w-3 h-3 text-green-500" />
      Todos los cambios guardados{at ? ` · ${formatTime(at)}` : ''}
    </span>
  );
};

export default NoteSaveIndicator;
