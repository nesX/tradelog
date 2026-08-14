import { parseCSV, previewCSV } from '../csvParser.service.js';

describe('csvParser.service', () => {
  const validLine = '2026-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout';

  describe('parseCSV', () => {
    it('parsea una línea válida', () => {
      const result = parseCSV(validLine);
      expect(result.totalLines).toBe(1);
      expect(result.valid).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const data = result.valid[0].data;
      expect(data.symbol).toBe('BTCUSDT');
      expect(data.trade_type).toBe('LONG');
      expect(data.entry_price).toBe(42000.5);
      expect(data.exit_price).toBe(43500);
      expect(data.quantity).toBe(0.1);
    });

    it('detecta y descarta la fila de cabecera', () => {
      const csv = [
        'fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas',
        validLine,
      ].join('\n');
      const result = parseCSV(csv);
      // La cabecera no cuenta como dato
      expect(result.totalLines).toBe(1);
      expect(result.valid).toHaveLength(1);
      // El número de línea contempla la cabecera (base-1 + header)
      expect(result.valid[0].lineNumber).toBe(2);
    });

    it('acepta decimales con coma (formato europeo)', () => {
      const line = '2026-01-15 10:30;ethusdt;short;2500,25;;3,5;;nota';
      const result = parseCSV(line);
      expect(result.errors).toHaveLength(0);
      const data = result.valid[0].data;
      expect(data.entry_price).toBe(2500.25);
      expect(data.quantity).toBe(3.5);
      expect(data.exit_price).toBeNull();
      expect(data.commission).toBe(0);
    });

    it('reporta error cuando faltan columnas', () => {
      const result = parseCSV('2026-01-15;BTCUSDT;LONG');
      expect(result.valid).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toMatch(/columnas/i);
    });

    it('reporta error cuando el trade_type es inválido', () => {
      const line = '2026-01-15 10:30;BTCUSDT;HOLD;42000;43000;0.1;0;x';
      const result = parseCSV(line);
      expect(result.valid).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('lanza si el CSV está vacío', () => {
      expect(() => parseCSV('   \n  ')).toThrow(/vac/i);
    });
  });

  describe('previewCSV', () => {
    it('devuelve summary con conteos válidos/erróneos', () => {
      const csv = [validLine, '2026-01-15;BAD'].join('\n');
      const preview = previewCSV(csv);
      expect(preview.summary.totalLines).toBe(2);
      expect(preview.summary.validLines).toBe(1);
      expect(preview.summary.errorLines).toBe(1);
      expect(preview.preview).toHaveLength(1);
    });
  });
});
