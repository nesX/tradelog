/**
 * Selector de estado anímico (1-5) con comentario opcional
 */
const BacktestMoodSelector = ({ value, onChange, comment, onCommentChange, label = 'Estado anímico' }) => {
  const moodConfig = [
    { score: 1, label: 'Muy mal', color: 'bg-red-500 hover:bg-red-600 border-red-500', inactive: 'border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20' },
    { score: 2, label: 'Mal', color: 'bg-orange-500 hover:bg-orange-600 border-orange-500', inactive: 'border-orange-300 text-orange-500 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20' },
    { score: 3, label: 'Normal', color: 'bg-yellow-500 hover:bg-yellow-600 border-yellow-500', inactive: 'border-yellow-300 text-yellow-500 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-900/20' },
    { score: 4, label: 'Bien', color: 'bg-lime-500 hover:bg-lime-600 border-lime-500', inactive: 'border-lime-300 text-lime-600 hover:bg-lime-50 dark:border-lime-700 dark:text-lime-400 dark:hover:bg-lime-900/20' },
    { score: 5, label: 'Excelente', color: 'bg-green-500 hover:bg-green-600 border-green-500', inactive: 'border-green-300 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20' },
  ];

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="flex gap-2">
        {moodConfig.map(({ score, label: moodLabel, color, inactive }) => {
          const isSelected = value === score;
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(score)}
              title={moodLabel}
              className={`flex-1 h-10 rounded-lg border-2 font-bold text-sm transition-all
                ${isSelected
                  ? `${color} text-white`
                  : `bg-transparent ${inactive}`
                }`}
            >
              {score}
            </button>
          );
        })}
      </div>
      {value && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {moodConfig.find((m) => m.score === value)?.label}
        </p>
      )}
      {onCommentChange !== undefined && (
        <textarea
          value={comment || ''}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Comentario opcional..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      )}
    </div>
  );
};

export default BacktestMoodSelector;
