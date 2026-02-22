import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { X, Image as ImageIcon, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import Input from '../common/Input.jsx';
import DateTimeInput from '../common/DateTimeInput.jsx';
import Select from '../common/Select.jsx';
import Button from '../common/Button.jsx';
import { useImageUpload } from '../../hooks/useImageUpload.js';
import { useSystems, useSystem } from '../../hooks/useSystems.js';
import { useTimeframes } from '../../hooks/useTimeframes.js';
import { TRADE_TYPE_OPTIONS } from '../../constants/tradeConstants.js';
import { formatDateForInput } from '../../utils/formatters.js';

const SCALE_OPTIONS = [
  { value: 1, label: 'Débil' },
  { value: 2, label: 'Media' },
  { value: 3, label: 'Fuerte' },
  { value: 4, label: 'Importante' },
];

/**
 * Bloque de análisis técnico para un sistema (primario o secundario)
 */
const SystemBlock = ({ role, systems, timeframes, analysis, onChange }) => {
  const selectedSystemId = analysis[`${role}_system_id`] || '';
  const signals = analysis[`${role}_signals`] || [];
  const selectedTimeframeIds = analysis.timeframe_ids || [];

  // Cargar señales del sistema seleccionado
  const { data: selectedSystem } = useSystem(selectedSystemId || null);

  const handleSystemChange = (e) => {
    const newId = e.target.value ? Number(e.target.value) : null;
    onChange(prev => ({
      ...prev,
      [`${role}_system_id`]: newId,
      [`${role}_signals`]: [],
    }));
  };

  const handleSignalToggle = (signalId, usesScale) => {
    const exists = signals.find(s => s.signal_id === signalId);
    if (exists) {
      onChange(prev => ({
        ...prev,
        [`${role}_signals`]: signals.filter(s => s.signal_id !== signalId),
      }));
    } else {
      onChange(prev => ({
        ...prev,
        [`${role}_signals`]: [...signals, { signal_id: signalId, value: 1 }],
      }));
    }
  };

  const handleScaleChange = (signalId, value) => {
    onChange(prev => ({
      ...prev,
      [`${role}_signals`]: signals.map(s =>
        s.signal_id === signalId ? { ...s, value: Number(value) } : s
      ),
    }));
  };

  const handleTimeframeToggle = (tfId) => {
    const exists = selectedTimeframeIds.includes(tfId);
    onChange(prev => ({
      ...prev,
      timeframe_ids: exists
        ? selectedTimeframeIds.filter(id => id !== tfId)
        : [...selectedTimeframeIds, tfId],
    }));
  };

  return (
    <div className="space-y-3">
      {/* Select sistema */}
      <div>
        <label className="label text-sm">
          Estrategia {role === 'primary' ? 'principal' : 'secundaria'}
        </label>
        <select
          className="input text-sm"
          value={selectedSystemId}
          onChange={handleSystemChange}
        >
          <option value="">— Sin estrategia —</option>
          {systems.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Señales del sistema seleccionado */}
      {selectedSystem && selectedSystem.signals && (
        <div>
          <label className="label text-xs text-gray-500 dark:text-gray-400">Señales presentes</label>
          <div className="space-y-2">
            {selectedSystem.signals.map(sig => {
              const tradeSignal = signals.find(s => s.signal_id === sig.id);
              const isPresent = !!tradeSignal;
              return (
                <div key={sig.id} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={isPresent}
                      onChange={() => handleSignalToggle(sig.id, sig.uses_scale)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{sig.name}</span>
                  </label>
                  {sig.uses_scale && isPresent && (
                    <select
                      className="input text-xs py-1 w-32"
                      value={tradeSignal.value}
                      onChange={e => handleScaleChange(sig.id, e.target.value)}
                    >
                      {SCALE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeframes (solo en primario) */}
      {role === 'primary' && timeframes.length > 0 && (
        <div>
          <label className="label text-xs text-gray-500 dark:text-gray-400">Timeframes</label>
          <div className="flex flex-wrap gap-2">
            {timeframes.map(tf => {
              const selected = selectedTimeframeIds.includes(tf.id);
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => handleTimeframeToggle(tf.id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    selected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Formulario para crear/editar trades con múltiples imágenes
 */
const CreateTradeForm = ({
  initialData = null,
  onSubmit,
  isLoading = false,
  onCancel,
  onDeleteImage,
  deletingImageId = null,
}) => {
  const isEditing = !!initialData;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: initialData ? {
      symbol: initialData.symbol,
      trade_type: initialData.trade_type,
      entry_price: initialData.entry_price,
      exit_price: initialData.exit_price || '',
      quantity: initialData.quantity,
      entry_date: formatDateForInput(initialData.entry_date),
      exit_date: initialData.exit_date ? formatDateForInput(initialData.exit_date) : '',
      commission: initialData.commission || 0,
      notes: initialData.notes || '',
      post_analysis: initialData.post_analysis || '',
    } : {
      trade_type: 'LONG',
      entry_date: formatDateForInput(new Date()),
      commission: 0,
      notes: '',
      post_analysis: '',
    },
  });

  const {
    files,
    previews,
    error: imageError,
    handleInputChange,
    handleDrop,
    handleDragOver,
    removeFile,
    clearFiles,
  } = useImageUpload();

  // Análisis técnico (sistemas/señales/timeframes) — separado del form principal
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSecondarySystem, setShowSecondarySystem] = useState(false);
  const [analysis, setAnalysis] = useState({
    primary_system_id: initialData?.primary_system_id || null,
    secondary_system_id: initialData?.secondary_system_id || null,
    primary_signals: initialData?.primary_signals?.map(s => ({ signal_id: s.signal_id, value: s.value })) || [],
    secondary_signals: initialData?.secondary_signals?.map(s => ({ signal_id: s.signal_id, value: s.value })) || [],
    timeframe_ids: [],
  });

  // Cargar sistemas y timeframes del usuario
  const { data: systemsList = [] } = useSystems();
  const { data: timeframesList = [] } = useTimeframes();

  // Observar el valor de entry_date para usarlo en el checkbox de cerrar trade
  const entryDate = watch('entry_date');

  // Handler para el checkbox de cerrar trade
  const handleCloseTrade = (checked) => {
    if (checked && entryDate) {
      setValue('exit_date', entryDate);
    } else if (!checked) {
      setValue('exit_date', '');
    }
  };

  // Imágenes existentes del trade (solo en edición)
  const existingImages = initialData?.images || [];

  // Construir URL de imagen existente
  const getExistingImageUrl = (image) => {
    const filename = image.filename;
    if (filename.startsWith('http')) return filename;
    return `${import.meta.env.VITE_API_URL || ''}/api/images/${filename}`;
  };

  // Manejar envío del formulario
  const handleFormSubmit = (data) => {
    const cleanData = {
      ...data,
      exit_price: data.exit_price || null,
      exit_date: data.exit_date || null,
      notes: data.notes || null,
      post_analysis: data.post_analysis || null,
    };

    // Incluir análisis técnico solo si el usuario configuró algo
    if (showAnalysis && analysis.primary_system_id) {
      cleanData.primary_system_id = analysis.primary_system_id;
      cleanData.primary_signals = analysis.primary_signals;
      if (analysis.timeframe_ids.length) cleanData.timeframe_ids = analysis.timeframe_ids;
      if (analysis.secondary_system_id) {
        cleanData.secondary_system_id = analysis.secondary_system_id;
        cleanData.secondary_signals = analysis.secondary_signals;
      }
    }

    onSubmit(cleanData, files);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Fila 1: Símbolo y Tipo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Símbolo"
          placeholder="BTCUSDT"
          {...register('symbol', {
            required: 'El símbolo es requerido',
            maxLength: { value: 20, message: 'Máximo 20 caracteres' },
          })}
          error={errors.symbol?.message}
        />

        <Select
          label="Tipo de Trade"
          options={TRADE_TYPE_OPTIONS}
          {...register('trade_type', { required: 'El tipo es requerido' })}
          error={errors.trade_type?.message}
          placeholder={null}
        />
      </div>

      {/* Fila 2: Precios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          type="number"
          step="any"
          label="Precio de Entrada"
          placeholder="42000.00"
          {...register('entry_price', {
            required: 'El precio de entrada es requerido',
            min: { value: 0.00000001, message: 'Debe ser mayor a 0' },
          })}
          error={errors.entry_price?.message}
        />

        <Input
          type="number"
          step="any"
          label="Precio de Salida"
          placeholder="Dejar vacío si el trade está abierto"
          {...register('exit_price', {
            min: { value: 0.00000001, message: 'Debe ser mayor a 0' },
          })}
          error={errors.exit_price?.message}
        />
      </div>

      {/* Fila 3: Cantidad y Comisión */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          type="number"
          step="any"
          label="Cantidad"
          placeholder="0.5"
          {...register('quantity', {
            required: 'La cantidad es requerida',
            min: { value: 0.00000001, message: 'Debe ser mayor a 0' },
          })}
          error={errors.quantity?.message}
        />

        <Input
          type="number"
          step="any"
          label="Comisión"
          placeholder="5.50"
          {...register('commission', {
            min: { value: 0, message: 'No puede ser negativa' },
          })}
          error={errors.commission?.message}
        />
      </div>

      {/* Fila 4: Fechas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <Controller
          name="entry_date"
          control={control}
          rules={{ required: 'La fecha de entrada es requerida' }}
          render={({ field }) => (
            <DateTimeInput
              label="Fecha de Entrada"
              error={errors.entry_date?.message}
              {...field}
            />
          )}
        />

        <Controller
          name="exit_date"
          control={control}
          render={({ field }) => (
            <DateTimeInput
              label="Fecha de Salida"
              error={errors.exit_date?.message}
              {...field}
            />
          )}
        />

        {/* Checkbox para cerrar trade */}
        <div className="flex items-center gap-3 pb-2">
          <input
            type="checkbox"
            id="close-trade"
            className="w-6 h-6 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
            onChange={(e) => handleCloseTrade(e.target.checked)}
          />
          <label htmlFor="close-trade" className="text-sm text-gray-700 dark:text-gray-300">
            Cerrado
          </label>
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="label">Notas</label>
        <textarea
          {...register('notes', {
            maxLength: { value: 2000, message: 'Máximo 2000 caracteres' },
          })}
          rows={3}
          className="input"
          placeholder="Agrega notas sobre este trade..."
        />
        {errors.notes && (
          <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
        )}
      </div>

      {/* Análisis Posterior */}
      <div>
        <label className="label">Análisis Posterior</label>
        <textarea
          {...register('post_analysis', {
            maxLength: { value: 2000, message: 'Máximo 2000 caracteres' },
          })}
          rows={3}
          className="input"
          placeholder="Reflexiones después de cerrar el trade..."
        />
        {errors.post_analysis && (
          <p className="mt-1 text-sm text-red-600">{errors.post_analysis.message}</p>
        )}
      </div>

      {/* Análisis técnico (colapsable) */}
      {systemsList.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Plus className={`w-4 h-4 transition-transform ${showAnalysis ? 'rotate-45' : ''}`} />
              Estrategia
            </span>
            {showAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAnalysis && (
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
              <SystemBlock
                role="primary"
                systems={systemsList}
                timeframes={timeframesList}
                analysis={analysis}
                onChange={setAnalysis}
              />

              {!showSecondarySystem ? (
                <button
                  type="button"
                  onClick={() => setShowSecondarySystem(true)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Estrategia secundaria
                </button>
              ) : (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estrategia secundaria</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSecondarySystem(false);
                        setAnalysis(prev => ({ ...prev, secondary_system_id: null, secondary_signals: [] }));
                      }}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Quitar
                    </button>
                  </div>
                  <SystemBlock
                    role="secondary"
                    systems={systemsList}
                    timeframes={timeframesList}
                    analysis={analysis}
                    onChange={setAnalysis}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Imágenes */}
      <div>
        <label className="label">
          Imágenes {isEditing ? '(agregar nuevas)' : '(opcional)'}
        </label>

        {/* Mostrar imágenes existentes en modo edición */}
        {isEditing && existingImages.length > 0 && (
          <div className="mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Imágenes existentes ({existingImages.length}):
            </p>
            <div className="flex flex-wrap gap-2">
              {existingImages.map((image, index) => (
                <div key={image.id} className="relative group">
                  <img
                    src={getExistingImageUrl(image)}
                    alt={`Imagen ${index + 1}`}
                    className={`h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600 ${
                      deletingImageId === image.id ? 'opacity-50' : ''
                    }`}
                  />
                  {onDeleteImage && (
                    <button
                      type="button"
                      onClick={() => onDeleteImage(image.id)}
                      disabled={deletingImageId === image.id}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    >
                      {deletingImageId === image.id ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previews de nuevas imágenes */}
        {previews.length > 0 && (
          <div className="mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Nuevas imágenes ({previews.length}):
            </p>
            <div className="flex flex-wrap gap-2">
              {previews.map((preview, index) => (
                <div key={preview.id} className="relative">
                  <img
                    src={preview.url}
                    alt={`Nueva imagen ${index + 1}`}
                    className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleInputChange}
            className="hidden"
            id="image-upload"
            multiple
          />
          <label htmlFor="image-upload" className="cursor-pointer">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ImageIcon className="w-8 h-8 text-gray-400" />
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Arrastra imágenes o{' '}
              <span className="text-blue-600 dark:text-blue-400 font-medium">haz click para seleccionar</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              JPG, PNG, WebP o GIF (máx. 5MB por imagen, hasta 10 imágenes)
            </p>
          </label>
        </div>

        {imageError && (
          <p className="mt-1 text-sm text-red-600">{imageError}</p>
        )}
      </div>

      {/* Botones */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" isLoading={isLoading}>
          {isEditing ? 'Guardar Cambios' : 'Crear Trade'}
        </Button>
      </div>
    </form>
  );
};

export default CreateTradeForm;
