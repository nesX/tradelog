import { useState, useEffect } from 'react';
import { Search, Filter, X } from 'lucide-react';
import Input from '../common/Input.jsx';
import Select from '../common/Select.jsx';
import Button from '../common/Button.jsx';
import { useSymbols } from '../../hooks/useTrades.js';
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

  // Sincronizar con filtros externos
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Manejar cambios
  const handleChange = (field, value) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
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
    localFilters.trade_type || localFilters.dateFrom || localFilters.dateTo;

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
            <Input
              type="date"
              label="Fecha desde"
              value={localFilters.dateFrom || ''}
              onChange={(e) => handleChange('dateFrom', e.target.value)}
            />
          </div>

          <div className="w-48">
            <Input
              type="date"
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
