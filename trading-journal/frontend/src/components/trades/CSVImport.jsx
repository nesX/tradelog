import { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import { usePreviewCSV, useImportCSV } from '../../hooks/useTrades.js';
import { useToast } from '../common/Toast.jsx';
import { CSV_FORMAT } from '../../constants/tradeConstants.js';
import { formatDate, formatNumber } from '../../utils/formatters.js';

/**
 * Componente para importar trades desde CSV
 */
const CSVImport = ({ isOpen, onClose }) => {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);

  const previewMutation = usePreviewCSV();
  const importMutation = useImportCSV();
  const toast = useToast();

  // Manejar preview
  const handlePreview = async () => {
    if (!csvText.trim()) {
      toast.error('Por favor ingresa datos CSV');
      return;
    }

    try {
      const result = await previewMutation.mutateAsync(csvText);
      setPreview(result.data);
    } catch (error) {
      toast.error(error.message || 'Error al procesar CSV');
    }
  };

  // Manejar importación
  const handleImport = async () => {
    try {
      const result = await importMutation.mutateAsync(csvText);

      if (result.data.success) {
        toast.success(`Se importaron ${result.data.imported} trades`);
        handleClose();
      } else {
        toast.error(result.data.message || 'Error al importar');
      }
    } catch (error) {
      toast.error(error.message || 'Error al importar CSV');
    }
  };

  // Cerrar y limpiar
  const handleClose = () => {
    setCsvText('');
    setPreview(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar Trades desde CSV"
      size="xl"
    >
      <div className="space-y-4">
        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-2">Formato esperado:</h4>
          <p className="text-sm text-blue-700 mb-2">
            {CSV_FORMAT.columns.join(';')}
          </p>
          <p className="text-sm text-blue-600">
            <span className="font-medium">Ejemplo:</span> {CSV_FORMAT.example}
          </p>
        </div>

        {/* Textarea para CSV */}
        <div>
          <label className="label">Datos CSV</label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            className="input font-mono text-sm"
            placeholder="Pega aquí tus datos CSV..."
          />
        </div>

        {/* Botón de preview */}
        {!preview && (
          <div className="flex justify-end">
            <Button
              onClick={handlePreview}
              isLoading={previewMutation.isPending}
              icon={FileText}
            >
              Previsualizar
            </Button>
          </div>
        )}

        {/* Resultados del preview */}
        {preview && (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center text-gray-600">
                <FileText className="w-4 h-4 mr-1" />
                {preview.summary.totalLines} líneas
              </div>
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                {preview.summary.validLines} válidas
              </div>
              {preview.summary.errorLines > 0 && (
                <div className="flex items-center text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {preview.summary.errorLines} con errores
                </div>
              )}
            </div>

            {/* Errores */}
            {preview.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-800 mb-2">Errores encontrados:</h4>
                <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                  {preview.errors.map((err, i) => (
                    <li key={i}>
                      <span className="font-medium">Línea {err.lineNumber}:</span> {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview de datos válidos */}
            {preview.preview.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Preview de trades:</h4>
                <div className="overflow-x-auto max-h-64 border border-gray-200 rounded-lg">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th>Símbolo</th>
                        <th>Tipo</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.slice(0, 10).map((item) => (
                        <tr key={item.lineNumber}>
                          <td>{item.lineNumber}</td>
                          <td>{formatDate(item.data.entry_date)}</td>
                          <td>{item.data.symbol}</td>
                          <td>{item.data.trade_type}</td>
                          <td>{formatNumber(item.data.entry_price)}</td>
                          <td>{item.data.exit_price ? formatNumber(item.data.exit_price) : '-'}</td>
                          <td>{formatNumber(item.data.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.preview.length > 10 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ...y {preview.preview.length - 10} más
                  </p>
                )}
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button
                variant="secondary"
                onClick={() => setPreview(null)}
              >
                Editar CSV
              </Button>

              <Button
                onClick={handleImport}
                isLoading={importMutation.isPending}
                disabled={preview.summary.validLines === 0 || preview.errors.length > 0}
                icon={Upload}
              >
                Importar {preview.summary.validLines} trades
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CSVImport;
