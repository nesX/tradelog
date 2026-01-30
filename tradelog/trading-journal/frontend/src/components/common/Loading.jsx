import { Loader2 } from 'lucide-react';

/**
 * Componente de loading reutilizable
 */
const Loading = ({ size = 'md', text = 'Cargando...', className = '' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
      <Loader2 className={`${sizes[size]} animate-spin text-blue-600`} />
      {text && (
        <p className="mt-2 text-sm text-gray-500">{text}</p>
      )}
    </div>
  );
};

/**
 * Componente de loading para página completa
 */
export const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loading size="lg" />
  </div>
);

/**
 * Componente de loading para tabla
 */
export const TableLoading = ({ rows = 5, cols = 6 }) => (
  <div className="animate-pulse">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex space-x-4 py-3 px-4 border-b border-gray-100">
        {[...Array(cols)].map((_, j) => (
          <div
            key={j}
            className="h-4 bg-gray-200 rounded flex-1"
            style={{ width: `${Math.random() * 40 + 60}%` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default Loading;
