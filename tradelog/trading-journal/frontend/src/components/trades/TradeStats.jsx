import { TrendingUp, TrendingDown, Target, Award, Activity } from 'lucide-react';
import { useStats } from '../../hooks/useStats.js';
import { formatCurrency, formatPercentage, formatNumber } from '../../utils/formatters.js';
import Loading from '../common/Loading.jsx';

/**
 * Componente de tarjetas de estadísticas
 */
const TradeStats = () => {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
            <div className="h-6 bg-gray-200 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return null;
  }

  const statCards = [
    {
      label: 'Total Trades',
      value: stats.total_trades,
      subValue: `${stats.open_trades} abiertos`,
      icon: Activity,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'P&L Total',
      value: formatCurrency(stats.total_pnl),
      icon: stats.total_pnl >= 0 ? TrendingUp : TrendingDown,
      color: stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: stats.total_pnl >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
    {
      label: 'Win Rate',
      value: `${stats.win_rate}%`,
      subValue: `${stats.winning_trades}W / ${stats.losing_trades}L`,
      icon: Target,
      color: stats.win_rate >= 50 ? 'text-green-600' : 'text-yellow-600',
      bgColor: stats.win_rate >= 50 ? 'bg-green-50' : 'bg-yellow-50',
    },
    {
      label: 'Mejor Trade',
      value: formatCurrency(stats.best_trade),
      icon: Award,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Peor Trade',
      value: formatCurrency(stats.worst_trade),
      icon: TrendingDown,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;

        return (
          <div key={index} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color} mt-1`}>
                  {stat.value}
                </p>
                {stat.subValue && (
                  <p className="text-xs text-gray-400 mt-1">{stat.subValue}</p>
                )}
              </div>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TradeStats;
