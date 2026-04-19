import { useState, useRef, useEffect } from 'react';
import { Edit2, Trash2, MoreVertical } from 'lucide-react';
import ImageViewer from '../common/ImageViewer.jsx';
import Modal from '../common/Modal.jsx';
import { useSystems } from '../../hooks/useSystems.js';
import {
  formatDate,
  formatNumber,
  formatPnL,
  formatPercentage,
  getTradeTypeClass,
  getStatusClass,
} from '../../utils/formatters.js';

/**
 * Componente de fila de trade para la tabla
 */
const TradeRow = ({ trade, onEdit, onDelete, isLast = false }) => {
  const [showActions, setShowActions] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const pnl = formatPnL(trade.pnl);

  // Obtener nombre del sistema primario (si existe)
  const { data: systems = [] } = useSystems();
  const primarySystem = trade.primary_system_id
    ? systems.find(s => s.id === trade.primary_system_id)
    : null;

  // Calcular si el menú debe aparecer hacia arriba
  const [menuPosition, setMenuPosition] = useState('bottom');

  useEffect(() => {
    if (showActions && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - buttonRect.bottom;

      // Si hay menos de 150px abajo, mostrar hacia arriba
      if (spaceBelow < 150) {
        setMenuPosition('top');
      } else {
        setMenuPosition('bottom');
      }
    }
  }, [showActions]);

  // Cerrar menú al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowActions(false);
      }
    };

    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showActions]);

  // Obtener primera imagen para thumbnail
  const firstImage = trade.images && trade.images.length > 0 ? trade.images[0] : null;
  const imageCount = trade.images ? trade.images.length : 0;

  // Manejar doble click en la fila
  const handleRowDoubleClick = (e) => {
    // Evitar abrir el modal si se hace doble click en el menú de acciones
    if (menuRef.current && menuRef.current.contains(e.target)) {
      return;
    }
    // Si hay imágenes, abrir el visor de imágenes
    if (firstImage) {
      setShowImageModal(true);
    } else if (trade.notes || trade.post_analysis) {
      // Si no hay imágenes pero hay notas o análisis, mostrar modal de notas
      setShowNotesModal(true);
    }
  };

  return (
    <>
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      onDoubleClick={handleRowDoubleClick}
    >
      {/* Imágenes */}
      <td className="px-4 py-3">
        {firstImage ? (
          <div className="relative">
            <ImageViewer
              images={trade.images}
              alt={`Trade ${trade.symbol}`}
              thumbnailSize="h-10 w-10"
              notes={trade.notes}
              postAnalysis={trade.post_analysis}
              externalOpen={showImageModal}
              onExternalOpenChange={setShowImageModal}
            />
            {imageCount > 1 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {imageCount}
              </span>
            )}
          </div>
        ) : (
          <div className="h-10 w-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
            <span className="text-gray-400 text-xs">-</span>
          </div>
        )}
      </td>

      {/* Símbolo */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-gray-900 dark:text-white">{trade.symbol}</span>
          {primarySystem && (
            <span className="inline-block px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full w-fit max-w-[120px] truncate">
              {primarySystem.name}
            </span>
          )}
        </div>
      </td>

      {/* Tipo */}
      <td className="px-4 py-3">
        <span className={getTradeTypeClass(trade.trade_type)}>
          {trade.trade_type}
        </span>
      </td>

      {/* Fecha entrada */}
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
        {formatDate(trade.entry_date)}
      </td>

      {/* Precio entrada */}
      <td className="px-4 py-3 text-right font-mono">
        {formatNumber(trade.entry_price, 4)}
      </td>

      {/* Precio salida */}
      <td className="px-4 py-3 text-right font-mono">
        {trade.exit_price ? formatNumber(trade.exit_price, 4) : '-'}
      </td>

      {/* Cantidad */}
      <td className="px-4 py-3 text-right font-mono">
        {formatNumber(trade.quantity, 4)}
      </td>

      {/* P&L */}
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className={`font-mono ${pnl.className}`}>{pnl.value}</span>
          {trade.pnl_percentage && (
            <span className={`text-xs ${trade.pnl_percentage > 0 ? 'text-profit' : 'text-loss'}`}>
              {formatPercentage(trade.pnl_percentage)}
            </span>
          )}
        </div>
      </td>

      {/* Estado */}
      <td className="px-4 py-3">
        <span className={getStatusClass(trade.status)}>
          {trade.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
        </span>
      </td>

      {/* Acciones */}
      <td className="px-4 py-3">
        <div className="relative" ref={menuRef}>
          <button
            ref={buttonRef}
            onClick={() => setShowActions(!showActions)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>

          {showActions && (
            <div
              className={`absolute right-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[120px]
                ${menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
            >
              <button
                onClick={() => {
                  onEdit(trade);
                  setShowActions(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Editar
              </button>
              <button
                onClick={() => {
                  onDelete(trade);
                  setShowActions(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>

    {/* Modal de notas (cuando no hay imágenes) */}
    {!firstImage && (trade.notes || trade.post_analysis) && (
      <Modal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        title={`Notas - ${trade.symbol}`}
        size="md"
      >
        {trade.notes && (
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Notas:</p>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {trade.notes}
            </p>
          </div>
        )}
        {trade.post_analysis && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-300 mb-1">Análisis Posterior:</p>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {trade.post_analysis}
            </p>
          </div>
        )}
      </Modal>
    )}
    </>
  );
};

export default TradeRow;
