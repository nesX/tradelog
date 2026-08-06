import { useState, useEffect, useRef, useCallback } from 'react';

// Hook de autosave para bloques de texto/callout. Unifica la lógica que estaba
// duplicada en NoteTextBlock y NoteCalloutBlock, y cierra tres vías de pérdida
// de datos:
//
//   1. Desmontaje con debounce pendiente → flush del último valor en el cleanup.
//   2. Fallo del PATCH → NO se revierte al contenido de caché mientras haya un
//      borrador sin guardar; se conserva el texto tecleado.
//   3. 401 / cierre / crash → el borrador se persiste en localStorage por blockId
//      y se restaura (y se re-guarda) al volver a montar tras el re-login.
//
// Además serializa los guardados por bloque para que no haya PATCHes fuera de orden.
//
// `onUpdate(value)` debe devolver (o resolver a) un booleano: true si el guardado
// tuvo éxito. Si es false, se conserva el borrador para reintento.

const DRAFT_PREFIX = 'note-block-draft-';

const draftKey = (blockId) => `${DRAFT_PREFIX}${blockId}`;

const readDraft = (blockId) => {
  try {
    return localStorage.getItem(draftKey(blockId));
  } catch {
    return null;
  }
};

const writeDraft = (blockId, value) => {
  try {
    localStorage.setItem(draftKey(blockId), value);
  } catch {
    /* almacenamiento lleno o no disponible: no bloquear la edición */
  }
};

const clearDraft = (blockId) => {
  try {
    localStorage.removeItem(draftKey(blockId));
  } catch {
    /* noop */
  }
};

export const useAutosaveTextarea = ({ block, onUpdate, delay = 1000 }) => {
  const blockId = block.id;
  const serverContent = block.content || '';

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(serverContent);

  const textareaRef = useRef(null);
  const debounceRef = useRef(null);
  const latestValueRef = useRef(value); // espejo del valor para el flush de cleanup
  const savedValueRef = useRef(serverContent); // último valor confirmado como persistido
  const saveChainRef = useRef(Promise.resolve()); // serialización de guardados
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  // Encola un guardado; se ejecuta tras el anterior (orden garantizado).
  const queueSave = useCallback(
    (val) => {
      writeDraft(blockId, val);
      saveChainRef.current = saveChainRef.current
        .catch(() => {})
        .then(async () => {
          const ok = await onUpdateRef.current(val);
          if (ok) {
            savedValueRef.current = val;
            // Solo limpiar el borrador si no llegó texto más nuevo entretanto.
            if (latestValueRef.current === val) clearDraft(blockId);
          }
          return ok;
        });
      return saveChainRef.current;
    },
    [blockId]
  );

  // Sincronizar con el contenido externo (invalidación de query) SOLO si no hay
  // borrador local sin guardar; así un PATCH fallido no borra lo tecleado.
  useEffect(() => {
    if (editing) return;
    if (value !== savedValueRef.current) return; // hay borrador sin confirmar
    if (serverContent !== savedValueRef.current) {
      savedValueRef.current = serverContent;
      setValue(serverContent);
    }
  }, [serverContent, editing, value]);

  // Restaurar borrador huérfano al montar (recuperación tras 401/crash).
  useEffect(() => {
    const draft = readDraft(blockId);
    if (draft == null) return;
    if (draft !== serverContent) {
      setValue(draft);
      queueSave(draft); // re-guardar ahora que (probablemente) hay sesión válida
    } else {
      clearDraft(blockId);
    }
    // Solo al montar: el resto de sincronización la maneja el efecto de arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoexpand + foco al entrar en modo edición.
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [editing]);

  const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      setValue(newValue);
      writeDraft(blockId, newValue); // persistir de inmediato ante un redirect/crash
      autoResize(e.target);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        queueSave(newValue);
      }, delay);
    },
    [blockId, delay, queueSave]
  );

  const handleBlur = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    queueSave(latestValueRef.current);
    setEditing(false);
  }, [queueSave]);

  const startEditing = useCallback(() => setEditing(true), []);

  // Flush del debounce pendiente al desmontar (navegación por URL, back, refetch
  // que quita el bloque): guarda el último tramo en vez de descartarlo.
  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        queueSave(latestValueRef.current);
      }
    },
    [queueSave]
  );

  return {
    value,
    editing,
    startEditing,
    textareaRef,
    handleChange,
    handleBlur,
  };
};
