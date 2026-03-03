import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { useCreateSession } from '../hooks/useBacktest.js';
import { getContinuationData } from '../api/endpoints.js';
import BacktestMoodSelector from '../components/backtest/BacktestMoodSelector.jsx';
import { useToast } from '../components/common/Toast.jsx';
import DateInput from '../components/common/DateInput.jsx';

const TIMEFRAMES = [
  '1S', '5S', '10S', '30S',
  '1m', '2m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w',
];

const BacktestNew = () => {
  const navigate = useNavigate();
  const { id: parentId } = useParams(); // presente si es continuación
  const toast = useToast();
  const createSession = useCreateSession();

  const [form, setForm] = useState({
    symbol: '',
    timeframe: '1h',
    period_date: '',
    mood_start_score: null,
    mood_start_comment: '',
  });
  const [parentData, setParentData] = useState(null);
  const [errors, setErrors] = useState({});

  // Si es continuación, precargar datos de la sesión padre
  useEffect(() => {
    if (!parentId) return;
    getContinuationData(parentId)
      .then((res) => {
        const d = res.data;
        setParentData(d);
        // Usar period_end_date como punto de inicio de la continuación
        const continuationDate = d.period_end_date || d.period_date;
        setForm((prev) => ({
          ...prev,
          symbol: d.symbol,
          timeframe: d.timeframe,
          period_date: continuationDate ? continuationDate.slice(0, 10) : '',
        }));
      })
      .catch(() => {
        toast.error('No se pudo cargar la sesión de origen');
      });
  }, [parentId]);

  const validate = () => {
    const e = {};
    if (!form.symbol.trim()) e.symbol = 'El símbolo es obligatorio';
    if (!form.timeframe) e.timeframe = 'El timeframe es obligatorio';
    if (!form.period_date) e.period_date = 'La fecha es obligatoria';
    if (!form.mood_start_score) e.mood = 'El estado anímico inicial es obligatorio';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      symbol: form.symbol.toUpperCase().trim(),
      timeframe: form.timeframe,
      period_date: form.period_date,
      mood_start_score: form.mood_start_score,
      mood_start_comment: form.mood_start_comment || undefined,
    };
    if (parentId) payload.parent_session_id = parseInt(parentId, 10);

    createSession.mutate(payload, {
      onSuccess: (res) => {
        toast.success('Sesión creada');
        navigate(`/backtest/${res.data.id}`);
      },
      onError: (err) => {
        toast.error(err?.error?.message || 'Error al crear la sesión');
      },
    });
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/backtest')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {parentId ? 'Continuar sesión' : 'Nueva sesión de backtesting'}
          </h1>
          {parentData && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-purple-600 dark:text-purple-400">
              <GitBranch className="w-3.5 h-3.5" />
              <span>
                Continuación de {parentData.symbol} —{' '}
                {new Date(parentData.period_date).toLocaleDateString('es', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        {/* Símbolo */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Símbolo *
          </label>
          <input
            type="text"
            value={form.symbol}
            onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))}
            placeholder="BTCUSDT"
            maxLength={20}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          {errors.symbol && <p className="text-xs text-red-500">{errors.symbol}</p>}
        </div>

        {/* Timeframe */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Timeframe *
          </label>
          <select
            value={form.timeframe}
            onChange={(e) => setForm((p) => ({ ...p, timeframe: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
          {errors.timeframe && <p className="text-xs text-red-500">{errors.timeframe}</p>}
        </div>

        {/* Fecha del período histórico */}
        <DateInput
          label="Fecha del período histórico *"
          value={form.period_date}
          onChange={(e) => setForm((p) => ({ ...p, period_date: e.target.value }))}
          error={errors.period_date}
        />

        {/* Estado anímico inicial */}
        <BacktestMoodSelector
          value={form.mood_start_score}
          onChange={(v) => setForm((p) => ({ ...p, mood_start_score: v }))}
          comment={form.mood_start_comment}
          onCommentChange={(v) => setForm((p) => ({ ...p, mood_start_comment: v }))}
          label="Estado anímico inicial *"
        />
        {errors.mood && <p className="text-xs text-red-500 -mt-3">{errors.mood}</p>}

        {/* Botones */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate('/backtest')}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createSession.isPending}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {createSession.isPending ? 'Creando...' : 'Crear sesión'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BacktestNew;
