import { forwardRef, useState, useEffect } from 'react';

/**
 * Convierte formato dd/mm/yyyy HH:mm a ISO (YYYY-MM-DDTHH:mm)
 */
const displayToIso = (displayValue) => {
  if (!displayValue || displayValue.length < 16) return '';

  const match = displayValue.match(/^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2})$/);
  if (!match) return '';

  const [, day, month, year, hours, minutes] = match;
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Convierte formato ISO (YYYY-MM-DDTHH:mm) a dd/mm/yyyy HH:mm
 */
const isoToDisplay = (isoValue) => {
  if (!isoValue) return '';

  const date = new Date(isoValue);
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Aplica máscara automática al input
 */
const applyMask = (value) => {
  // Eliminar caracteres no numéricos excepto / y :
  let cleaned = value.replace(/[^\d]/g, '');

  let result = '';
  for (let i = 0; i < cleaned.length && i < 12; i++) {
    if (i === 2 || i === 4) result += '/';
    if (i === 8) result += ' ';
    if (i === 10) result += ':';
    result += cleaned[i];
  }

  return result;
};

/**
 * Componente DateTimeInput con formato dd/mm/yyyy HH:mm
 */
const DateTimeInput = forwardRef(({
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

  // Sincronizar valor externo (ISO) con display
  useEffect(() => {
    if (value) {
      setDisplayValue(isoToDisplay(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    const masked = applyMask(e.target.value);
    setDisplayValue(masked);

    // Convertir a ISO y notificar
    const isoValue = displayToIso(masked);
    if (onChange) {
      // Simular evento para react-hook-form
      onChange({
        target: {
          name,
          value: isoValue,
        },
      });
    }
  };

  const handleBlur = (e) => {
    if (onBlur) {
      onBlur(e);
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
        onBlur={handleBlur}
        placeholder="dd/mm/yyyy HH:mm"
        maxLength={16}
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

DateTimeInput.displayName = 'DateTimeInput';

export default DateTimeInput;
