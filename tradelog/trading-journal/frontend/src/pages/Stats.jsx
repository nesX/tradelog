import { TrendingUp, TrendingDown, Award, Target, BarChart3 } from 'lucide-react';
import {
  useStats,
  useStatsBySymbol,
  useStatsByType,
  useTopTrades,
} from '../hooks/useStats.js';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters.js';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

/**
 * Página de estadísticas
 */
const Stats = () => {
  const { data: generalStats, isLoading: loadingGeneral } = useStats();
  const { data: symbolStats, isLoading: loadingSymbol } = useStatsBySymbol();
  const { data: typeStats, isLoading: loadingType } = useStatsByType();
  const { data: topTrades, isLoading: loadingTop } = useTopTrades(5);

  const isLoading = loadingGeneral || loadingSymbol || loadingType || loadingTop;

  if (isLoading) {
    return <Loading size="lg" />;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estadísticas</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Analiza el rendimiento de tus trades
        </p>
      </div>

      {/* Resumen general */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total P&L"
          value={formatCurrency(generalStats?.total_pnl || 0)}
          icon={generalStats?.total_pnl >= 0 ? TrendingUp : TrendingDown}
          color={generalStats?.total_pnl >= 0 ? 'green' : 'red'}
        />
        <StatCard
          title="Win Rate"
          value={`${generalStats?.win_rate || 0}%`}
          subtitle={`${generalStats?.winning_trades || 0}W / ${generalStats?.losing_trades || 0}L`}
          icon={Target}
          color={generalStats?.win_rate >= 50 ? 'green' : 'yellow'}
        />
        <StatCard
          title="P&L Promedio"
          value={formatCurrency(generalStats?.avg_pnl || 0)}
          icon={BarChart3}
          color="blue"
        />
        <StatCard
          title="Total Trades"
          value={generalStats?.total_trades || 0}
          subtitle={`${generalStats?.closed_trades || 0} cerrados`}
          icon={Award}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estadísticas por tipo */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Por Tipo de Trade
          </h3>

          <div className="space-y-4">
            {typeStats?.LONG && (
              <TypeStatRow
                type="LONG"
                stats={typeStats.LONG}
                color="blue"
              />
            )}
            {typeStats?.SHORT && (
              <TypeStatRow
                type="SHORT"
                stats={typeStats.SHORT}
                color="purple"
              />
            )}
            {!typeStats?.LONG && !typeStats?.SHORT && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No hay datos disponibles</p>
            )}
          </div>
        </div>

        {/* Estadísticas por símbolo */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Por Símbolo
          </h3>

          {symbolStats && symbolStats.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {symbolStats.map((stat) => (
                <div
                  key={stat.symbol}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">{stat.symbol}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ({stat.total_trades} trades)
                    </span>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${stat.total_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(stat.total_pnl)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      WR: {stat.win_rate}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No hay datos disponibles</p>
          )}
        </div>

        {/* Mejores trades */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
            Mejores Trades
          </h3>

          {topTrades?.best && topTrades.best.length > 0 ? (
            <div className="space-y-2">
              {topTrades.best.map((trade) => (
                <TradeStatRow key={trade.id} trade={trade} isProfit />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No hay datos disponibles</p>
          )}
        </div>

        {/* Peores trades */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <TrendingDown className="w-5 h-5 mr-2 text-red-500" />
            Peores Trades
          </h3>

          {topTrades?.worst && topTrades.worst.length > 0 ? (
            <div className="space-y-2">
              {topTrades.worst.map((trade) => (
                <TradeStatRow key={trade.id} trade={trade} isProfit={false} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No hay datos disponibles</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Componente de tarjeta de estadística
const StatCard = ({ title, value, subtitle, icon: Icon, color }) => {
  const colors = {
    green: { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' },
    red: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/30', text: 'text-yellow-600 dark:text-yellow-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
  };

  const colorClasses = colors[color] || colors.blue;

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className={`text-2xl font-bold ${colorClasses.text} mt-1`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${colorClasses.bg}`}>
          <Icon className={`w-5 h-5 ${colorClasses.text}`} />
        </div>
      </div>
    </div>
  );
};

// Componente de fila de tipo de trade
const TypeStatRow = ({ type, stats, color }) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div className="flex items-center">
        <span className={`badge ${colorClasses[color]}`}>{type}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-3">
          {stats.total_trades} trades
        </span>
      </div>
      <div className="text-right">
        <p className={`font-medium ${parseFloat(stats.total_pnl) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(stats.total_pnl)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          WR: {stats.win_rate}% | Avg: {formatCurrency(stats.avg_pnl)}
        </p>
      </div>
    </div>
  );
};

// Componente de fila de trade
const TradeStatRow = ({ trade, isProfit }) => {
  return (
    <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded">
      <div>
        <span className="font-medium text-gray-900 dark:text-white">{trade.symbol}</span>
        <span className={`ml-2 text-xs ${trade.trade_type === 'LONG' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`}>
          {trade.trade_type}
        </span>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(trade.entry_date, { includeTime: false })}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-medium ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(trade.pnl)}
        </p>
        <p className={`text-xs ${isProfit ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {trade.pnl_percentage > 0 ? '+' : ''}{trade.pnl_percentage}%
        </p>
      </div>
    </div>
  );
};

export default Stats;
