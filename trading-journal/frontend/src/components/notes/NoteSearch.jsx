import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { useNoteTags } from '../../hooks/useNotes.js';

const NoteSearch = ({ onSearchActive, onChange, onEnter }) => {
  const [inputValue, setInputValue] = useState('');
  const [q, setQ] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  const { data: allTags = [] } = useNoteTags();

  // Debounce text input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(inputValue.trim()), 400);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue]);

  // Notify parent on search state change
  useEffect(() => {
    const active = !!(q || selectedTagIds.length > 0);
    onSearchActive(active);
    onChange({ q, tagIds: selectedTagIds });
  }, [q, selectedTagIds, onSearchActive, onChange]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClear = () => {
    setInputValue('');
    setQ('');
    setSelectedTagIds([]);
    setTagDropdownOpen(false);
  };

  const toggleTag = (tagId) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const removeTag = (tagId) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  };

  const isActive = !!(inputValue || selectedTagIds.length > 0);
  const activeTags = allTags.filter((t) => selectedTagIds.includes(t.id));
  const availableTags = allTags.filter((t) => !selectedTagIds.includes(t.id));

  return (
    <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700 space-y-1.5">
      {/* Text input */}
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder="Buscar notas…"
          className="w-full pl-8 pr-7 py-1.5 text-sm rounded-md
            bg-gray-100 dark:bg-gray-700
            text-gray-800 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            border border-transparent focus:border-blue-400 dark:focus:border-blue-500
            focus:bg-white dark:focus:bg-gray-600
            focus:outline-none transition-colors"
        />
        {isActive && (
          <button
            onClick={handleClear}
            className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tag filter */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex flex-wrap gap-1 items-center min-h-[24px]">
          {activeTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white"
              style={{ backgroundColor: tag.color || '#6B7280' }}
            >
              {tag.name}
              <button
                onClick={() => removeTag(tag.id)}
                className="hover:opacity-70 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}

          {allTags.length > 0 && (
            <button
              onClick={() => setTagDropdownOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs
                text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span>{selectedTagIds.length === 0 ? 'Filtrar por tag' : '+'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>

        {tagDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-48
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-600
            rounded-md shadow-lg py-1 max-h-48 overflow-y-auto">
            {availableTags.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No hay más tags</p>
            )}
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => { toggleTag(tag.id); setTagDropdownOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5
                  text-sm text-gray-700 dark:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color || '#6B7280' }}
                />
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteSearch;
