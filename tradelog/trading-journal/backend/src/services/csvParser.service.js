import { csvLineSchema } from '../validators/trade.validator.js';
import * as tradeRepository from '../repositories/trade.repository.js';
import { ValidationError } from '../middleware/errorHandler.js';

/**
 * Service para parseo y validación de CSV
 * Formato esperado: fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
 * Ejemplo: 2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade
 */

const DELIMITER = ';';
const EXPECTED_COLUMNS = 8;

/**
 * Parsea una fecha en formato flexible
 * @param {string} dateStr - String de fecha
 * @returns {Date|null}
 */
const parseDate = (dateStr) => {
  if (!dateStr || dateStr.trim() === '') return null;

  // Intentar varios formatos
  const formats = [
    // ISO format
    dateStr,
    // Formato con espacio en lugar de T
    dateStr.replace(' ', 'T'),
  ];

  for (const format of formats) {
    const date = new Date(format);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

/**
 * Parsea un número de forma segura
 * @param {string} value - Valor a parsear
 * @returns {number|null}
 */
const parseNumber = (value) => {
  if (!value || value.trim() === '') return null;

  // Reemplazar coma por punto (formato europeo)
  const normalized = value.trim().replace(',', '.');
  const num = parseFloat(normalized);

  return isNaN(num) ? null : num;
};

/**
 * Parsea una línea de CSV
 * @param {string} line - Línea de CSV
 * @param {number} lineNumber - Número de línea para mensajes de error
 * @returns {Object} Datos parseados o errores
 */
const parseLine = (line, lineNumber) => {
  const parts = line.split(DELIMITER);

  // Verificar número de columnas
  if (parts.length < EXPECTED_COLUMNS - 1) { // notes es opcional
    return {
      success: false,
      lineNumber,
      error: `Se esperaban ${EXPECTED_COLUMNS} columnas, se encontraron ${parts.length}`,
    };
  }

  const [
    dateStr,
    symbol,
    tradeType,
    entryPriceStr,
    exitPriceStr,
    quantityStr,
    commissionStr,
    notes = '',
  ] = parts;

  // Parsear valores
  const entryDate = parseDate(dateStr);
  const entryPrice = parseNumber(entryPriceStr);
  const exitPrice = parseNumber(exitPriceStr);
  const quantity = parseNumber(quantityStr);
  const commission = parseNumber(commissionStr) || 0;

  // Construir objeto
  const tradeData = {
    entry_date: entryDate,
    symbol: symbol?.trim().toUpperCase(),
    trade_type: tradeType?.trim().toUpperCase(),
    entry_price: entryPrice,
    exit_price: exitPrice,
    quantity: quantity,
    commission: commission,
    notes: notes?.trim() || null,
    exit_date: exitPrice ? entryDate : null, // Si hay exit_price, usar misma fecha
  };

  // Validar con Joi
  const { error, value } = csvLineSchema.validate(tradeData, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return {
      success: false,
      lineNumber,
      error: error.details.map(d => d.message).join(', '),
      raw: line,
    };
  }

  return {
    success: true,
    lineNumber,
    data: value,
    raw: line,
  };
};

/**
 * Parsea datos CSV completos
 * @param {string} csvData - Contenido CSV
 * @returns {Object} Resultado del parseo
 */
export const parseCSV = (csvData) => {
  const lines = csvData
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new ValidationError('El CSV está vacío');
  }

  // Verificar si la primera línea es un header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('fecha') ||
                    firstLine.includes('symbol') ||
                    firstLine.includes('tipo') ||
                    firstLine.includes('date');

  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    throw new ValidationError('El CSV no contiene datos');
  }

  const results = {
    valid: [],
    errors: [],
    totalLines: dataLines.length,
  };

  dataLines.forEach((line, index) => {
    const lineNumber = hasHeader ? index + 2 : index + 1; // +1 para base-1, +1 si hay header
    const result = parseLine(line, lineNumber);

    if (result.success) {
      results.valid.push(result);
    } else {
      results.errors.push(result);
    }
  });

  return results;
};

/**
 * Valida y prepara datos CSV sin guardar (preview)
 * @param {string} csvData - Contenido CSV
 * @returns {Object} Preview de los datos
 */
export const previewCSV = (csvData) => {
  const parseResult = parseCSV(csvData);

  return {
    preview: parseResult.valid.map(v => ({
      lineNumber: v.lineNumber,
      data: v.data,
    })),
    errors: parseResult.errors,
    summary: {
      totalLines: parseResult.totalLines,
      validLines: parseResult.valid.length,
      errorLines: parseResult.errors.length,
    },
  };
};

/**
 * Importa trades desde CSV
 * @param {string} csvData - Contenido CSV
 * @returns {Promise<Object>} Resultado de la importación
 */
export const importCSV = async (csvData) => {
  const parseResult = parseCSV(csvData);

  // Si hay errores, retornar sin importar
  if (parseResult.errors.length > 0) {
    return {
      success: false,
      imported: 0,
      errors: parseResult.errors,
      message: `Se encontraron ${parseResult.errors.length} errores en el CSV`,
    };
  }

  // Si no hay datos válidos
  if (parseResult.valid.length === 0) {
    return {
      success: false,
      imported: 0,
      errors: [],
      message: 'No hay datos válidos para importar',
    };
  }

  // Importar trades
  const tradesData = parseResult.valid.map(v => v.data);
  const createdTrades = await tradeRepository.createMany(tradesData);

  return {
    success: true,
    imported: createdTrades.length,
    trades: createdTrades,
    errors: [],
    message: `Se importaron ${createdTrades.length} trades exitosamente`,
  };
};
