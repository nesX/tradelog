import BacktestTradeItem from './BacktestTradeItem.jsx';

const BacktestTradeList = ({ trades = [], onDelete, onDeleteImage, canDelete = false }) => {
  if (trades.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
        No hay trades registrados aún
      </p>
    );
  }

  return (
    <div>
      {trades.map((trade) => (
        <BacktestTradeItem
          key={trade.id}
          trade={trade}
          onDelete={onDelete}
          onDeleteImage={onDeleteImage}
          canDelete={canDelete}
        />
      ))}
    </div>
  );
};

export default BacktestTradeList;
