import { forwardRef } from 'react';

/**
 * Componente Input reutilizable con soporte para react-hook-form
 */
const Input = forwardRef(({
  label,
  error,
  helperText,
  type = 'text',
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  const inputClasses = `input ${error ? 'input-error' : ''} ${className}`;

  return (
    <div className={containerClassName}>
      {label && (
        <label className="label" htmlFor={props.id || props.name}>
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <input
        ref={ref}
        type={type}
        className={inputClasses}
        {...props}
      />

      {(error || helperText) && (
        <p className={`mt-1 text-sm ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
