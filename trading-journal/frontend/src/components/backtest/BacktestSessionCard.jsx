import { Link } from 'react-router-dom';
import { Calendar, Clock, TrendingUp, GitBranch } from 'lucide-react';

const MoodDot = ({ score }) => {
  if (!score) return null;
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-lime-500', 'bg-green-500'];
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[score]}`}
      title={`Estado anímico: ${score}/5`}
    />
  );
};

const BacktestSessionCard = ({ session }) => {
  const periodDate = new Date(session.period_date).toLocaleDateString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const closedDate = session.closed_at
    ? new Date(session.closed_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })
    : null;

  return (
    <Link
      to={`/backtest/${session.id}`}
      className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900 dark:text-white">{session.symbol}</span>
          <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-600 dark:text-gray-300">
            {session.timeframe}
          </span>
          {session.is_continuation && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-xs text-purple-700 dark:text-purple-300">
              <GitBranch className="w-3 h-3" />
              Continuación
            </span>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            session.closed_at
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
          }`}
        >
          {session.closed_at ? closedDate : 'Activa'}
        </span>
      </div>

      {/* Fecha del período */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-3">
        <Calendar className="w-3.5 h-3.5" />
        <span>{periodDate}</span>
        {session.is_continuation && session.parent_period_date && (
          <span className="text-gray-400 dark:text-gray-500">
            · cont. de {new Date(session.parent_period_date).toLocaleDateString('es', { day: '2-digit', month: 'short' })} ({session.parent_symbol})
          </span>
        )}
      </div>

      {/* Stats */}
      {session.total_trades > 0 ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-green-600 dark:text-green-400">{session.long_wins + session.short_wins}W</span>
            <span className="text-gray-400">·</span>
            <span className="font-semibold text-red-500 dark:text-red-400">{session.long_losses + session.short_losses}L</span>
            {session.break_evens > 0 && (
              <>
                <span className="text-gray-400">·</span>
                <span className="font-semibold text-gray-500 dark:text-gray-400">{session.break_evens}BE</span>
              </>
            )}
          </div>
          {session.win_rate !== null && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{session.win_rate}%</span>
            </div>
          )}
          {/* Estado anímico */}
          <div className="ml-auto flex items-center gap-1">
            <MoodDot score={session.mood_start_score} />
            {session.mood_end_score && (
              <>
                <span className="text-gray-300 dark:text-gray-600 text-xs">→</span>
                <MoodDot score={session.mood_end_score} />
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">Sin trades registrados</p>
      )}
    </Link>
  );
};

export default BacktestSessionCard;
