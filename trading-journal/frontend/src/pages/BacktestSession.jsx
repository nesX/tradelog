import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, GitBranch, Lock, Camera, X } from 'lucide-react';
import { useSession, useAddTrade, useDeleteTrade, useCloseSession, useDeleteTradeImage } from '../hooks/useBacktest.js';
import BacktestTradeButton, { RESULT_KEYS, getResultConfig } from '../components/backtest/BacktestTradeButton.jsx';
import BacktestTradeList from '../components/backtest/BacktestTradeList.jsx';
import BacktestCloseModal from '../components/backtest/BacktestCloseModal.jsx';
import { useToast } from '../components/common/Toast.jsx';

const MoodBadge = ({ score, label }) => {
  if (!score) return null;
  const colors = ['', 'text-red-500', 'text-orange-500', 'text-yellow-500', 'text-lime-600', 'text-green-600'];
  return (
    <span className={`text-xs font-medium ${colors[score]}`}>
      {label} {score}/5
    </span>
  );
};

const StatBadge = ({ value, label, colorClass }) => (
  <div className="text-center">
    <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
    <div className="text-xs text-gray-400 dark:text-gray-500">{label}</div>
  </div>
);

// Área de comentario inline tras hacer click en un botón de resultado
const TradeCommentArea = ({ result, onConfirm, onCancel, isLoading }) => {
  const [comment, setComment] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const config = getResultConfig(result);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirm = () => {
    if (!comment.trim()) return;
    onConfirm({ result, comment: comment.trim(), imageFile: imageFile || undefined });
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-md text-sm font-bold ${config.color}`}>
          {config.label}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">— agrega un comentario</span>
      </div>
      <textarea
        autoFocus
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="¿Qué observaste? ¿Por qué este resultado?"
        rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      {/* Adjuntar captura */}
      <div className="flex items-center gap-3">
        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Captura seleccionada"
              className="h-16 w-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <Camera className="w-3.5 h-3.5" />
            Adjuntar captura (opcional)
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageChange}
              className="hidden"
            />
          </label>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">Ctrl+Enter para confirmar · Esc para cancelar</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!comment.trim() || isLoading}
          className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Guardando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
};

const BacktestSession = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const sessionId = parseInt(id, 10);

  const { data: session, isLoading, isError } = useSession(sessionId);
  const addTrade = useAddTrade(sessionId);
  const deleteTrade = useDeleteTrade();
  const deleteTradeImage = useDeleteTradeImage(sessionId);
  const closeSession = useCloseSession();

  const [selectedResult, setSelectedResult] = useState(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400 dark:text-gray-500">
        Cargando sesión...
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 dark:text-gray-400 mb-4">No se encontró la sesión</p>
        <Link to="/backtest" className="text-blue-600 dark:text-blue-400 text-sm hover:underline">
          ← Volver
        </Link>
      </div>
    );
  }

  const isActive = !session.closed_at;

  const handleTradeConfirm = (data) => {
    addTrade.mutate(data, {
      onSuccess: () => {
        setSelectedResult(null);
        toast.success('Trade registrado');
      },
      onError: (err) => {
        toast.error(err?.error?.message || 'Error al registrar trade');
      },
    });
  };

  const handleDeleteTrade = (tradeId) => {
    deleteTrade.mutate(
      { tradeId, sessionId },
      {
        onSuccess: () => toast.success('Trade eliminado'),
        onError: (err) => toast.error(err?.error?.message || 'Error al eliminar'),
      }
    );
  };

  const handleDeleteTradeImage = (tradeId) => {
    deleteTradeImage.mutate(tradeId, {
      onSuccess: () => toast.success('Imagen eliminada'),
      onError: (err) => toast.error(err?.error?.message || 'Error al eliminar la imagen'),
    });
  };

  const handleCloseSession = (data) => {
    closeSession.mutate(
      { id: sessionId, data },
      {
        onSuccess: () => {
          setCloseModalOpen(false);
          toast.success('Sesión cerrada');
        },
        onError: (err) => {
          toast.error(err?.error?.message || 'Error al cerrar la sesión');
        },
      }
    );
  };

  const periodDate = new Date(session.period_date).toLocaleDateString('es', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/backtest')}
          className="mt-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{session.symbol}</h1>
            <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-600 dark:text-gray-300">
              {session.timeframe}
            </span>
            {session.is_continuation && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-xs text-purple-700 dark:text-purple-300">
                <GitBranch className="w-3 h-3" />
                Continuación
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isActive
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              {isActive ? 'Activa' : 'Cerrada'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{periodDate}</p>
          <div className="flex items-center gap-3 mt-1">
            <MoodBadge score={session.mood_start_score} label="Inicio" />
            {!isActive && session.mood_end_score && (
              <>
                <span className="text-gray-300 dark:text-gray-600">→</span>
                <MoodBadge score={session.mood_end_score} label="Fin" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Contadores */}
      {session.total_trades > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-around">
            <StatBadge value={session.total_trades} label="Total" colorClass="text-gray-700 dark:text-gray-200" />
            <StatBadge value={session.long_wins + session.short_wins} label="Wins" colorClass="text-green-600 dark:text-green-400" />
            <StatBadge value={session.long_losses + session.short_losses} label="Losses" colorClass="text-red-500 dark:text-red-400" />
            {session.break_evens > 0 && (
              <StatBadge value={session.break_evens} label="BE" colorClass="text-gray-500 dark:text-gray-400" />
            )}
            {session.win_rate !== null && (
              <StatBadge
                value={`${session.win_rate}%`}
                label="Win rate"
                colorClass={session.win_rate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}
              />
            )}
          </div>
        </div>
      )}

      {/* Modo activo: botones de registro */}
      {isActive && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {RESULT_KEYS.map((result) => (
              <BacktestTradeButton
                key={result}
                result={result}
                onClick={(r) => setSelectedResult(selectedResult === r ? null : r)}
                disabled={addTrade.isPending}
              />
            ))}
          </div>

          {selectedResult && (
            <TradeCommentArea
              result={selectedResult}
              onConfirm={handleTradeConfirm}
              onCancel={() => setSelectedResult(null)}
              isLoading={addTrade.isPending}
            />
          )}

          <button
            type="button"
            onClick={() => setCloseModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Lock className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      )}

      {/* Modo cerrado: comentario de cierre + botón continuar */}
      {!isActive && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          {session.closing_comment && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Comentario de cierre
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{session.closing_comment}</p>
            </div>
          )}
          {session.mood_start_comment && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Ánimo inicial
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{session.mood_start_comment}</p>
            </div>
          )}
          {session.mood_end_comment && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Ánimo final
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{session.mood_end_comment}</p>
            </div>
          )}
          <Link
            to={`/backtest/${session.id}/continue`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <GitBranch className="w-4 h-4" />
            Continuar sesión
          </Link>
        </div>
      )}

      {/* Lista de trades */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Trades ({session.total_trades})
        </h2>
        <BacktestTradeList
          trades={session.trades || []}
          onDelete={handleDeleteTrade}
          onDeleteImage={handleDeleteTradeImage}
          canDelete={isActive}
        />
      </div>

      {/* Modal cerrar sesión */}
      <BacktestCloseModal
        isOpen={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        onConfirm={handleCloseSession}
        isLoading={closeSession.isPending}
      />
    </div>
  );
};

export default BacktestSession;
