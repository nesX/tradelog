import { Link } from 'react-router-dom';
import { Plus, FlaskConical } from 'lucide-react';
import { useSessions } from '../hooks/useBacktest.js';
import BacktestSessionCard from '../components/backtest/BacktestSessionCard.jsx';

const Backtest = () => {
  const { data: sessions, isLoading, isError } = useSessions();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Backtesting</h1>
        </div>
        <Link
          to="/backtest/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva sesión
        </Link>
      </div>

      {/* Contenido */}
      {isLoading && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          Cargando sesiones...
        </div>
      )}

      {isError && (
        <div className="text-center py-12 text-red-500 dark:text-red-400">
          Error al cargar las sesiones
        </div>
      )}

      {!isLoading && !isError && sessions?.length === 0 && (
        <div className="text-center py-16">
          <FlaskConical className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-2">No tienes sesiones de backtesting aún</p>
          <Link
            to="/backtest/new"
            className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
          >
            Crea tu primera sesión →
          </Link>
        </div>
      )}

      {!isLoading && !isError && sessions?.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => (
            <BacktestSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Backtest;
