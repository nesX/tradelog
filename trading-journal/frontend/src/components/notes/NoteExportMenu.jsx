import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileJson, FileText } from 'lucide-react';
import * as api from '../../api/endpoints.js';

const NoteExportMenu = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const downloadJSON = async () => {
    setLoading('json');
    setOpen(false);
    try {
      const res = await api.exportNotesJSON();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notas-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  };

  const downloadMarkdown = async () => {
    setLoading('md');
    setOpen(false);
    try {
      const res = await api.exportNotesMarkdown();
      const content = typeof res === 'string' ? res : res.data || '';
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notas-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {loading ? 'Exportando...' : 'Exportar'}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
          <button
            onClick={downloadJSON}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FileJson className="w-4 h-4 text-blue-500" />
            Exportar como JSON
          </button>
          <button
            onClick={downloadMarkdown}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FileText className="w-4 h-4 text-green-500" />
            Exportar como Markdown
          </button>
        </div>
      )}
    </div>
  );
};

export default NoteExportMenu;
