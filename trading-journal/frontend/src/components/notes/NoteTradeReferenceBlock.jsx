import { useState } from 'react';
import { X, Plus, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { parseTradeUrl } from '../../utils/referenceLinks.js';
import {
  useAddTradeToBlock,
  useRemoveTradeFromBlock,
} from '../../hooks/useNotes.js';
import { useTrade } from '../../hooks/useTrades.js';
import ImageViewer from '../common/ImageViewer.jsx';
import { useToast } from '../common/Toast.jsx';
import { formatPercentage } from '../../utils/formatters.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

const pnlClassFor = (pnl) => {
  if (pnl == null) return 'text-gray-500 dark:text-gray-400';
  if (pnl > 0) return 'text-profit';
  if (pnl < 0) return 'text-loss';
  return 'text-gray-600 dark:text-gray-300';
};

const sideBadgeClass = (side) =>
  side === 'LONG'
    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';

// ---------------------------------------------------------------
// Card: muestra una tarjeta compacta del trade. Click → modal.
// ---------------------------------------------------------------
const TradeCard = ({ trade, onOpen, onRemove }) => {
  // LEFT JOIN puede devolver null si el trade fue borrado (soft delete)
  if (!trade || !trade.id) {
    return (
      <div className="flex-shrink-0 w-[140px] h-[110px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center px-2">
        <div className="flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-[10px] text-center leading-tight italic">
            Trade no disponible
          </span>
        </div>
      </div>
    );
  }

  const imgUrl = trade.first_image
    ? `${API_BASE}/api/images/${trade.first_image}`
    : null;
  const SideIcon = trade.side === 'LONG' ? TrendingUp : TrendingDown;

  return (
    <div className="group flex-shrink-0 w-[140px] relative">
      <button
        onClick={onOpen}
        className="w-[140px] h-[110px] rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-white dark:bg-gray-800 flex flex-col"
        title={`Trade ${trade.symbol}`}
      >
        <div className="w-full h-[80px] flex items-center justify-center bg-gray-100 dark:bg-gray-700 overflow-hidden">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={trade.symbol}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="text-base font-bold text-gray-700 dark:text-gray-200">
                {trade.symbol}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${sideBadgeClass(
                  trade.side
                )}`}
              >
                <SideIcon className="w-2.5 h-2.5" />
                {trade.side}
              </span>
            </div>
          )}
        </div>
        <div className="h-[30px] px-2 flex items-center justify-between bg-white dark:bg-gray-800">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
            {trade.symbol}
          </span>
          <span className={`text-xs font-mono ${pnlClassFor(trade.pnl)}`}>
            {trade.pnl_percentage != null
              ? formatPercentage(trade.pnl_percentage)
              : '—'}
          </span>
        </div>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        title="Remover trade del bloque"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------
// Modal: pide el detalle pesado del trade al abrirse.
// ---------------------------------------------------------------
const TradeDetailModal = ({ tradeId, isOpen, onClose }) => {
  const { data: trade } = useTrade(tradeId);

  if (!trade) return null;

  return (
    <ImageViewer
      images={trade.images || []}
      alt={`Trade ${trade.symbol}`}
      thumbnailSize="hidden"
      className="hidden"
      notes={trade.notes}
      postAnalysis={trade.post_analysis}
      externalOpen={isOpen}
      onExternalOpenChange={(v) => !v && onClose()}
    />
  );
};

// ---------------------------------------------------------------
// Bloque principal: galería horizontal de trades + input "+"
// ---------------------------------------------------------------
const NoteTradeReferenceBlock = ({ block, noteId }) => {
  const trades = block.trades || [];
  const [urlInput, setUrlInput] = useState('');
  const [parseError, setParseError] = useState(null);
  const [openTradeId, setOpenTradeId] = useState(null);
  const [showInput, setShowInput] = useState(trades.length === 0);

  const addTrade = useAddTradeToBlock();
  const removeTrade = useRemoveTradeFromBlock();
  const toast = useToast();

  const handlePaste = async (value) => {
    setUrlInput(value);
    if (!value.trim()) {
      setParseError(null);
      return;
    }
    const parsed = parseTradeUrl(value);
    if (!parsed) {
      setParseError('URL de trade no válida');
      return;
    }
    setParseError(null);
    try {
      await addTrade.mutateAsync({
        blockId: block.id,
        tradeId: parsed.tradeId,
        noteId,
      });
      setUrlInput('');
      setShowInput(false);
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Error al añadir el trade';
      toast.error(msg);
    }
  };

  const handleRemove = (tradeId) => {
    removeTrade.mutate({ blockId: block.id, tradeId, noteId });
  };

  return (
    <div className="py-2 px-1">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {trades.map((trade, idx) => (
          <TradeCard
            key={trade?.id ?? `null-${idx}`}
            trade={trade}
            onOpen={() => trade?.id && setOpenTradeId(trade.id)}
            onRemove={() => trade?.id && handleRemove(trade.id)}
          />
        ))}

        {/* Tile "+" / input para pegar URL */}
        {showInput ? (
          <div className="flex-shrink-0 w-[180px] flex flex-col gap-1">
            <input
              type="text"
              autoFocus
              value={urlInput}
              onChange={(e) => handlePaste(e.target.value)}
              onBlur={() => {
                if (!urlInput.trim() && trades.length > 0) {
                  setShowInput(false);
                  setParseError(null);
                }
              }}
              placeholder="Pega URL del trade…"
              className="px-2 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 dark:focus:border-blue-500"
            />
            {parseError && (
              <div className="flex items-center gap-1 text-[10px] text-red-500 dark:text-red-400">
                <AlertCircle className="w-3 h-3" />
                {parseError}
              </div>
            )}
            {addTrade.isPending && (
              <span className="text-[10px] text-blue-500 dark:text-blue-400 italic">
                Añadiendo…
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="flex-shrink-0 w-[140px] h-[110px] rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            title="Añadir trade"
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-medium">Añadir trade</span>
          </button>
        )}
      </div>

      {/* Modal de detalle del trade activo */}
      {openTradeId != null && (
        <TradeDetailModal
          tradeId={openTradeId}
          isOpen={true}
          onClose={() => setOpenTradeId(null)}
        />
      )}
    </div>
  );
};

export default NoteTradeReferenceBlock;
