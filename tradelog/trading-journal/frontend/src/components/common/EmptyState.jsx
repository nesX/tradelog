import { FileX } from 'lucide-react';
import Button from './Button.jsx';

/**
 * Componente para mostrar estado vacío
 */
const EmptyState = ({
  icon: Icon = FileX,
  title = 'No hay datos',
  description = 'No se encontraron elementos para mostrar.',
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>

      <h3 className="text-lg font-medium text-gray-900 mb-1">
        {title}
      </h3>

      <p className="text-sm text-gray-500 max-w-sm mb-4">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
