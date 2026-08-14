import { useState, useEffect, useRef } from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import DateInput from '../common/DateInput.jsx';
import Select from '../common/Select.jsx';
import Button from '../common/Button.jsx';
import { useSymbols, useTradeTags } from '../../hooks/useTrades.js';
import {
  TRADE_STATUS_OPTIONS,
  TRADE_TYPE_OPTIONS,
  SORT_OPTIONS,
  SORT_DIRECTIONS,
} from '../../constants/tradeConstants.js';

/**
 * Componente de filtros para la tabla de trades
 */
const TradeFilters = ({ filters, onFiltersChange }) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: symbols = [] } = useSymbols();
  const { data: allTags = [] } = useTradeTags();
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef(null);

  // Sincronizar con filtros externos
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Cerrar dropdown de tags al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target)) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Manejar cambios
  const handleChange = (field, value) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
  };

  // tag_ids se guarda como CSV ("1,2,3") en localFilters, igual que lo espera
  // el backend (listTradesQuerySchema); se deriva el array seleccionado desde ahí.
  const selectedTagIds = localFilters.tag_ids
    ? localFilters.tag_ids.split(',').map(Number).filter(Boolean)
    : [];

  const toggleTag = (tagId) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    handleChange('tag_ids', next.length > 0 ? next.join(',') : undefined);
  };

  // Aplicar filtros
  const applyFilters = () => {
    onFiltersChange({ ...localFilters, page: 1 });
  };

  // Limpiar filtros
  const clearFilters = () => {
    const clearedFilters = {
      page: 1,
      limit: 20,
      sortBy: 'entry_date',
      sortDir: 'DESC',
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  // Verificar si hay filtros activos
  const hasActiveFilters = localFilters.status || localFilters.symbol ||
    localFilters.trade_type || localFilters.dateFrom || localFilters.dateTo ||
    localFilters.tag_ids;

  // Preparar opciones de símbolos
  const symbolOptions = [
    { value: '', label: 'Todos los símbolos' },
    ...symbols.map(s => ({ value: s, label: s })),
  ];

  return (
    <div className="card mb-4">
      {/* Filtros básicos */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Búsqueda por símbolo */}
        <div className="w-48">
          <Select
            label="Símbolo"
            value={localFilters.symbol || ''}
            onChange={(e) => handleChange('symbol', e.target.value)}
            options={symbolOptions}
            placeholder={null}
          />
        </div>

        {/* Estado */}
        <div className="w-36">
          <Select
            label="Estado"
            value={localFilters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            options={TRADE_STATUS_OPTIONS}
            placeholder={null}
          />
        </div>

        {/* Tipo */}
        <div className="w-36">
          <Select
            label="Tipo"
            value={localFilters.trade_type || ''}
            onChange={(e) => handleChange('trade_type', e.target.value)}
            options={[{ value: '', label: 'Todos' }, ...TRADE_TYPE_OPTIONS]}
            placeholder={null}
          />
        </div>

        {/* Tags (multi-select) */}
        {allTags.length > 0 && (
          <div className="w-48 relative" ref={tagDropdownRef}>
            <label className="label text-sm">Tags</label>
            <button
              type="button"
              onClick={() => setTagDropdownOpen((v) => !v)}
              className="input text-sm flex items-center justify-between w-full text-left"
            >
              <span className="truncate">
                {selectedTagIds.length === 0
                  ? 'Todos los tags'
                  : `${selectedTagIds.length} seleccionado${selectedTagIds.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>

            {tagDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 w-56
                bg-white dark:bg-gray-800
                border border-gray-200 dark:border-gray-600
                rounded-md shadow-lg py-1 max-h-48 overflow-y-auto">
                {allTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5
                        text-sm text-gray-700 dark:text-gray-200
                        hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left
                        ${selected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || '#6B7280' }}
                      />
                      <span className="flex-1 truncate">{tag.name}</span>
                      {selected && <span className="text-blue-600 dark:text-blue-400">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Ordenar por */}
        <div className="w-40">
          <Select
            label="Ordenar por"
            value={localFilters.sortBy || 'entry_date'}
            onChange={(e) => handleChange('sortBy', e.target.value)}
            options={SORT_OPTIONS}
            placeholder={null}
          />
        </div>

        {/* Dirección */}
        <div className="w-32">
          <Select
            label="Orden"
            value={localFilters.sortDir || 'DESC'}
            onChange={(e) => handleChange('sortDir', e.target.value)}
            options={SORT_DIRECTIONS}
            placeholder={null}
          />
        </div>

        {/* Botones */}
        <div className="flex gap-2">
          <Button onClick={applyFilters} icon={Search}>
            Buscar
          </Button>

          <Button
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            icon={Filter}
          >
            {showAdvanced ? 'Menos' : 'Más'}
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} icon={X}>
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Filtros avanzados */}
      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-3">
          <div className="w-48">
            <DateInput
              label="Fecha desde"
              value={localFilters.dateFrom || ''}
              onChange={(e) => handleChange('dateFrom', e.target.value)}
            />
          </div>

          <div className="w-48">
            <DateInput
              label="Fecha hasta"
              value={localFilters.dateTo || ''}
              onChange={(e) => handleChange('dateTo', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeFilters;
