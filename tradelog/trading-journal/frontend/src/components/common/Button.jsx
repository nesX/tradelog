import { Loader2 } from 'lucide-react';

/**
 * Componente Button reutilizable
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  ...props
}) => {
  // Variantes de estilo
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    success: 'btn-success',
    ghost: 'btn bg-transparent text-gray-600 hover:bg-gray-100',
  };

  // Tamaños
  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-5 py-2.5',
  };

  const baseClasses = variants[variant] || variants.primary;
  const sizeClasses = sizes[size] || sizes.md;

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Cargando...
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && (
            <Icon className="w-4 h-4 mr-2" />
          )}
          {children}
          {Icon && iconPosition === 'right' && (
            <Icon className="w-4 h-4 ml-2" />
          )}
        </>
      )}
    </button>
  );
};

export default Button;
