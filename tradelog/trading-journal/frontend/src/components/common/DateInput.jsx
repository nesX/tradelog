import { forwardRef, useState, useEffect } from 'react';

/**
 * Convierte formato dd/mm/yyyy a YYYY-MM-DD
 */
const displayToIso = (displayValue) => {
  if (!displayValue) return '';
  const match = displayValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

/**
 * Convierte formato YYYY-MM-DD a dd/mm/yyyy
 */
const isoToDisplay = (isoValue) => {
  if (!isoValue) return '';
  const match = isoValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

/**
 * Aplica máscara automática dd/mm/yyyy
 */
const applyMask = (value) => {
  const cleaned = value.replace(/[^\d]/g, '');
  let result = '';
  for (let i = 0; i < cleaned.length && i < 8; i++) {
    if (i === 2 || i === 4) result += '/';
    result += cleaned[i];
  }
  return result;
};

/**
 * Componente DateInput con formato dd/mm/yyyy
 * Emite el valor en formato YYYY-MM-DD (compatible con el backend)
 */
const DateInput = forwardRef(({
  label,
  error,
  helperText,
  className = '',
  containerClassName = '',
  value,
  onChange,
  onBlur,
  name,
  ...props
}, ref) => {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    setDisplayValue(value ? isoToDisplay(value) : '');
  }, [value]);

  const handleChange = (e) => {
    const masked = applyMask(e.target.value);
    setDisplayValue(masked);

    const isoValue = displayToIso(masked);
    if (onChange) {
      onChange({ target: { name, value: isoValue } });
    }
  };

  const inputClasses = `input ${error ? 'input-error' : ''} ${className}`;

  return (
    <div className={containerClassName}>
      {label && (
        <label className="label" htmlFor={props.id || name}>
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <input
        ref={ref}
        type="text"
        name={name}
        className={inputClasses}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder="dd/mm/yyyy"
        maxLength={10}
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

DateInput.displayName = 'DateInput';

export default DateInput;
