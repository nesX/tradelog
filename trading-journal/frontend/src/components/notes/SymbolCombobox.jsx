import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { isTradfi } from '../../utils/reminders.js';

const MAX_RESULTS = 60;

export function ContractBadge({ contractType }) {
  const tradfi = isTradfi(contractType);
  return (
    <span
      className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
        tradfi
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {tradfi ? 'TradFi' : 'Cripto'}
    </span>
  );
}

/**
 * Combobox del catálogo de perpetuos. Filtra por símbolo y por activo base
 * (`sol` encuentra SOLUSDT); los que el usuario ya usó vienen primero (orden del
 * backend). Flechas + Enter + Escape, y táctil. No hay "agregar": si un símbolo
 * no aparece, no existe como perpetuo en Binance Futures.
 */
export default function SymbolCombobox({ symbols = [], value, onChange, disabled = false, isLoading = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const selected = symbols.find((s) => s.symbol === value);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return symbols.slice(0, MAX_RESULTS);
    const starts = [];
    const contains = [];
    for (const s of symbols) {
      if (s.symbol.startsWith(q) || s.base_asset.startsWith(q)) starts.push(s);
      else if (s.symbol.includes(q)) contains.push(s);
      if (starts.length >= MAX_RESULTS) break;
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [symbols, query]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  // Mantener visible la opción resaltada al navegar con flechas
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const pick = (symbol) => {
    onChange(symbol.symbol);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[highlight]) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === 'Escape' && open) {
      // No cerrar el modal: solo la lista
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          className="input pr-24 uppercase placeholder:normal-case"
          value={open ? query : value || ''}
          placeholder={isLoading ? 'Cargando símbolos…' : 'Buscar símbolo (BTC, XAU, NVDA…)'}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1.5 pointer-events-none">
          {selected && !open && <ContractBadge contractType={selected.contract_type} />}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      {open && !disabled && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto
                     bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                     rounded-lg shadow-lg py-1"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">
              {query ? 'Sin coincidencias: no existe como perpetuo en Binance Futures' : 'Sin símbolos'}
            </li>
          ) : (
            results.map((s, i) => (
              <li
                key={s.symbol}
                role="option"
                aria-selected={s.symbol === value}
                onPointerDown={(e) => e.preventDefault()} // no perder el foco antes del click
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                  i === highlight ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                } ${s.symbol === value ? 'font-semibold' : ''}`}
              >
                <span className="flex-1 text-gray-800 dark:text-gray-100">{s.symbol}</span>
                {s.last_used_at && <span className="text-[10px] text-blue-500">usado</span>}
                <ContractBadge contractType={s.contract_type} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
