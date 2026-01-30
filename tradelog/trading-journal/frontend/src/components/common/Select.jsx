import { forwardRef } from 'react';

/**
 * Componente Select reutilizable
 */
const Select = forwardRef(({
  label,
  error,
  options = [],
  placeholder = 'Seleccionar...',
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  const selectClasses = `input ${error ? 'input-error' : ''} ${className}`;

  return (
    <div className={containerClassName}>
      {label && (
        <label className="label" htmlFor={props.id || props.name}>
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <select
        ref={ref}
        className={selectClasses}
        {...props}
      >
        {placeholder && (
          <option value="">{placeholder}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
