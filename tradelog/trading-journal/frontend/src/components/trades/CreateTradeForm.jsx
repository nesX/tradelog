import { useForm, Controller } from 'react-hook-form';
import { X, Image as ImageIcon, Plus } from 'lucide-react';
import Input from '../common/Input.jsx';
import DateTimeInput from '../common/DateTimeInput.jsx';
import Select from '../common/Select.jsx';
import Button from '../common/Button.jsx';
import { useImageUpload } from '../../hooks/useImageUpload.js';
import { TRADE_TYPE_OPTIONS } from '../../constants/tradeConstants.js';
import { formatDateForInput } from '../../utils/formatters.js';

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
    } : {
      trade_type: 'LONG',
      entry_date: formatDateForInput(new Date()),
      commission: 0,
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
    // Convertir strings vacíos a null
    const cleanData = {
      ...data,
      exit_price: data.exit_price || null,
      exit_date: data.exit_date || null,
      notes: data.notes || null,
    };

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
          placeholder="43500.00"
          helperText="Dejar vacío si el trade está abierto"
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              helperText="Dejar vacío si el trade está abierto"
              error={errors.exit_date?.message}
              {...field}
            />
          )}
        />
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
