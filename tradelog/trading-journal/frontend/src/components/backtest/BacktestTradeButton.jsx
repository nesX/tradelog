/**
 * Botón grande para registrar un resultado de trade en backtesting
 */
const RESULT_CONFIG = {
  long_win: {
    label: 'Long Win',
    shortLabel: 'L+',
    color: 'bg-green-500 hover:bg-green-600 border-green-500 text-white',
  },
  long_loss: {
    label: 'Long Loss',
    shortLabel: 'L−',
    color: 'bg-red-500 hover:bg-red-600 border-red-500 text-white',
  },
  short_win: {
    label: 'Short Win',
    shortLabel: 'S+',
    color: 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white',
  },
  short_loss: {
    label: 'Short Loss',
    shortLabel: 'S−',
    color: 'bg-orange-500 hover:bg-orange-600 border-orange-500 text-white',
  },
  break_even: {
    label: 'Break Even',
    shortLabel: 'BE',
    color: 'bg-gray-400 hover:bg-gray-500 border-gray-400 text-white dark:bg-gray-600 dark:hover:bg-gray-500 dark:border-gray-600',
  },
};

export const RESULT_KEYS = Object.keys(RESULT_CONFIG);

export const getResultConfig = (result) => RESULT_CONFIG[result] || RESULT_CONFIG.break_even;

const BacktestTradeButton = ({ result, onClick, disabled = false }) => {
  const config = RESULT_CONFIG[result];
  if (!config) return null;

  return (
    <button
      type="button"
      onClick={() => onClick(result)}
      disabled={disabled}
      className={`flex flex-col items-center justify-center px-4 py-5 rounded-xl border-2 font-semibold text-base transition-all shadow-sm
        ${config.color}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
    >
      <span className="text-2xl font-bold">{config.shortLabel}</span>
      <span className="text-xs mt-1 opacity-90">{config.label}</span>
    </button>
  );
};

export default BacktestTradeButton;
