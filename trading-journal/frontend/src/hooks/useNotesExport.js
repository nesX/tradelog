import { useState } from 'react';
import * as api from '../api/endpoints.js';
import { useToast } from '../components/common/Toast.jsx';

const downloadBlob = (content, type, extension) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notas-${new Date().toISOString().slice(0, 10)}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Descarga de todas las notas como JSON o Markdown.
 * `loading` vale 'json' | 'md' mientras hay una exportación en curso.
 */
export function useNotesExport() {
  const [loading, setLoading] = useState(null);
  const toast = useToast();

  const exportJSON = async () => {
    setLoading('json');
    try {
      const res = await api.exportNotesJSON();
      downloadBlob(JSON.stringify(res.data, null, 2), 'application/json', 'json');
    } catch (err) {
      toast.error(err?.message || 'No se pudo exportar las notas como JSON');
    } finally {
      setLoading(null);
    }
  };

  const exportMarkdown = async () => {
    setLoading('md');
    try {
      const res = await api.exportNotesMarkdown();
      const content = typeof res === 'string' ? res : res.data || '';
      downloadBlob(content, 'text/markdown', 'md');
    } catch (err) {
      toast.error(err?.message || 'No se pudo exportar las notas como Markdown');
    } finally {
      setLoading(null);
    }
  };

  return { loading, exportJSON, exportMarkdown };
}
