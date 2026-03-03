import { X, Trash2 } from 'lucide-react';
import ImageViewer from '../common/ImageViewer.jsx';
import { getResultConfig } from './BacktestTradeButton.jsx';

const BacktestTradeItem = ({ trade, onDelete, onDeleteImage, canDelete = false }) => {
  const config = getResultConfig(trade.result);
  const time = new Date(trade.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span
        className={`shrink-0 inline-flex items-center justify-center w-10 h-7 rounded-md text-xs font-bold ${config.color}`}
      >
        {config.shortLabel}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-200 break-words">{trade.comment}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{time}</p>
        {trade.image_filename && !trade._optimistic && (
          <div className="mt-1.5 relative inline-block">
            <ImageViewer
              images={[{ filename: trade.image_filename }]}
              alt="Captura del trade"
              thumbnailSize="h-14 w-14"
            />
            {canDelete && onDeleteImage && (
              <button
                type="button"
                onClick={() => onDeleteImage(trade.id)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
                title="Eliminar imagen"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(trade.id)}
          className="shrink-0 p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Eliminar trade"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default BacktestTradeItem;
