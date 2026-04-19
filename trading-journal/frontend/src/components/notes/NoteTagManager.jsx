import { useState } from 'react';
import { X, Pencil, Trash2, Plus, Check } from 'lucide-react';
import { useNoteTags, useCreateTag, useUpdateTag, useDeleteTag } from '../../hooks/useNotes.js';

const DEFAULT_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
];

const NoteTagManager = ({ isOpen, onClose }) => {
  const { data: tags = [], isLoading } = useNoteTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      await createTag.mutateAsync({ name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor('#3B82F6');
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Error al crear tag');
    }
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleUpdate = async (tagId) => {
    try {
      await updateTag.mutateAsync({ tagId, data: { name: editName.trim(), color: editColor } });
      setEditingId(null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Error al actualizar tag');
    }
  };

  const handleDelete = async (tagId) => {
    await deleteTag.mutateAsync(tagId);
    setDeleteConfirmId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Gestionar Tags</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Lista de tags */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {isLoading ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-gray-500">No hay tags creados aún.</p>
          ) : (
            tags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                {editingId === tag.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                    />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white"
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate(tag.id)}
                    />
                    <button onClick={() => handleUpdate(tag.id)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{tag.name}</span>
                    {deleteConfirmId === tag.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600">¿Eliminar?</span>
                        <button onClick={() => handleDelete(tag.id)} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded">Sí</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded">No</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => startEdit(tag)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirmId(tag.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Crear nuevo tag */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600 p-0.5"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del tag"
              className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <button
              type="submit"
              disabled={!newName.trim() || createTag.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Crear
            </button>
          </form>
          <div className="flex gap-1 mt-2 flex-wrap">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: newColor === c ? '#1d4ed8' : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteTagManager;
