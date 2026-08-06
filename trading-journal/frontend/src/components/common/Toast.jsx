import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { registerToastHandler } from '../../utils/toastBridge.js';

/**
 * Context para el sistema de notificaciones toast
 */
const ToastContext = createContext(null);

/**
 * Tipos de toast
 */
const toastTypes = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50 dark:bg-green-900/50',
    borderColor: 'border-green-500',
    textColor: 'text-green-800 dark:text-green-200',
    iconColor: 'text-green-500',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-50 dark:bg-red-900/50',
    borderColor: 'border-red-500',
    textColor: 'text-red-800 dark:text-red-200',
    iconColor: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/50',
    borderColor: 'border-yellow-500',
    textColor: 'text-yellow-800 dark:text-yellow-200',
    iconColor: 'text-yellow-500',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50 dark:bg-blue-900/50',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-800 dark:text-blue-200',
    iconColor: 'text-blue-500',
  },
};

/**
 * Componente Toast individual
 */
const ToastItem = ({ id, type = 'info', message, action, duration = 5000, onClose }) => {
  const config = toastTypes[type] || toastTypes.info;
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <div
      className={`flex items-start p-4 rounded-lg border-l-4 shadow-lg overflow-hidden ${config.bgColor} ${config.borderColor} animate-slide-in`}
      role="alert"
    >
      <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0`} />
      <p className={`ml-3 text-sm font-medium ${config.textColor} flex-1`}>
        {message}
      </p>
      {action && (
        <button
          onClick={() => {
            action.onClick?.();
            onClose(id);
          }}
          className={`ml-3 text-sm font-semibold underline underline-offset-2 ${config.iconColor} hover:opacity-70 flex-shrink-0`}
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => onClose(id)}
        className={`ml-4 ${config.iconColor} hover:opacity-70 flex-shrink-0`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * Provider para el sistema de toast
 */
let toastSeq = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // `options` opcional: { action: { label, onClick }, duration }. Id con contador
  // monótono para evitar colisiones de key entre toasts creados en el mismo ms.
  const addToast = useCallback((type, message, options = {}) => {
    const id = `${Date.now()}-${toastSeq++}`;
    setToasts((prev) => [
      ...prev,
      { id, type, message, action: options.action, duration: options.duration },
    ]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Exponer el disparador de toasts a código fuera de React (MutationCache global).
  useEffect(() => {
    registerToastHandler(addToast);
    return () => registerToastHandler(null);
  }, [addToast]);

  // Métodos de conveniencia. `options` opcional (action, duration).
  const toast = {
    success: (message, options) => addToast('success', message, options),
    error: (message, options) => addToast('error', message, options),
    warning: (message, options) => addToast('warning', message, options),
    info: (message, options) => addToast('info', message, options),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Container de toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            id={t.id}
            type={t.type}
            message={t.message}
            action={t.action}
            duration={t.duration}
            onClose={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/**
 * Hook para usar el sistema de toast
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return context;
};
