import { useState, useRef } from 'react';
import { X, Upload, ImagePlus } from 'lucide-react';
import { useAddImage, useDeleteImage, useUpdateBlockMetadata } from '../../hooks/useNotes.js';
import ImageViewer from '../common/ImageViewer.jsx';
import { compressImage } from '../../utils/imageCompression.js';
import { useToast } from '../common/Toast.jsx';

const MAX_SIZE_BEFORE_COMPRESSION = 5 * 1024 * 1024; // 5MB

const API_BASE = import.meta.env.VITE_API_URL || '';

const toViewerFormat = (images) =>
  (images || []).map((img) => ({ filename: img.image_path, id: img.id }));

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
};

const NoteImageGalleryBlock = ({ block, noteId }) => {
  const addImage = useAddImage();
  const deleteImage = useDeleteImage();
  const updateMetadata = useUpdateBlockMetadata();
  const fileInputRef = useRef(null);
  const toast = useToast();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);

  // Estado local del footer de metadatos
  const meta = block.metadata || {};
  const [editingMeta, setEditingMeta] = useState(false);
  const [dateValue, setDateValue] = useState(meta.analysis_date || '');
  const [symbolInput, setSymbolInput] = useState('');
  const [symbols, setSymbols] = useState(meta.symbols || []);

  const images = block.images || [];
  const viewerImages = toViewerFormat(images);

  const openViewer = (idx) => {
    setViewerStartIndex(idx);
    setViewerOpen(true);
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > MAX_SIZE_BEFORE_COMPRESSION) {
        toast.error(`"${file.name}" supera el tamaño máximo de 5MB.`);
        continue;
      }
      try {
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append('image', compressed);
        await addImage.mutateAsync({ blockId: block.id, formData, noteId });
      } catch (err) {
        toast.error(err?.message || 'Error al subir la imagen.');
      }
    }
    e.target.value = '';
  };

  const handleDelete = (e, imageId) => {
    e.stopPropagation();
    deleteImage.mutate({ imageId, noteId });
  };

  const saveMeta = () => {
    updateMetadata.mutate({
      blockId: block.id,
      noteId,
      metadata: {
        ...meta,
        analysis_date: dateValue || null,
        symbols,
      },
    });
    setEditingMeta(false);
  };

  const addSymbol = (raw) => {
    const sym = raw.trim().toUpperCase();
    if (!sym || symbols.includes(sym) || symbols.length >= 10) return;
    setSymbols((prev) => [...prev, sym]);
    setSymbolInput('');
  };

  const removeSymbol = (sym) => setSymbols((prev) => prev.filter((s) => s !== sym));

  const hasMetadata = meta.analysis_date || (meta.symbols && meta.symbols.length > 0);

  return (
    <div className="py-2 px-1">

      {images.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
          {images.map((img, idx) => (
            <div key={img.id} className="group flex-shrink-0">
              <div className="relative">
                <button
                  onClick={() => openViewer(idx)}
                  className="w-24 h-24 rounded-lg overflow-hidden border-2 border-transparent
                             hover:border-blue-500 transition-colors focus:outline-none
                             ring-0 focus:ring-2 focus:ring-blue-400"
                  title="Ver en grande"
                >
                  <img
                    src={`${API_BASE}/api/images/${img.image_path}`}
                    alt={`Imagen ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                  {img.created_at && (
                    <span className="absolute bottom-1 left-1.5 text-[10px] leading-none
                                     text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]
                                     pointer-events-none select-none">
                      {formatDate(img.created_at)}
                    </span>
                  )}
                </button>

                <button
                  onClick={(e) => handleDelete(e, img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center
                             bg-red-500 hover:bg-red-600 text-white rounded-full
                             opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Eliminar imagen"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex-shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={addImage.isPending}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600
                         hover:border-blue-400 dark:hover:border-blue-500
                         flex flex-col items-center justify-center gap-1
                         text-gray-400 hover:text-blue-500 dark:hover:text-blue-400
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Agregar imagen"
            >
              {addImage.isPending ? (
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-xs font-medium">Agregar</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {images.length === 0 && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={addImage.isPending}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 px-4
                     border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl
                     hover:border-blue-400 dark:hover:border-blue-500
                     text-gray-400 hover:text-blue-500 dark:hover:text-blue-400
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {addImage.isPending ? (
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Upload className="w-7 h-7" />
              <span className="text-sm font-medium">Agregar imágenes</span>
              <span className="text-xs opacity-60">JPG, PNG, WebP, GIF</span>
            </>
          )}
        </button>
      )}

      {/* Footer de metadatos — fecha de análisis y símbolos */}
      {editingMeta ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5
                       bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200
                       text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />

          {/* Chips de símbolos */}
          <div className="flex flex-wrap gap-1">
            {symbols.map((s) => (
              <span key={s}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
                           bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-mono">
                {s}
                <button onClick={() => removeSymbol(s)} className="hover:text-red-500">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>

          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSymbol(symbolInput); }
            }}
            onBlur={() => { if (symbolInput.trim()) addSymbol(symbolInput); }}
            placeholder="Símbolo + Enter"
            maxLength={20}
            className="border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 w-32
                       bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-mono
                       text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:font-sans"
          />

          <button
            onClick={saveMeta}
            className="px-2 py-0.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs"
          >
            Guardar
          </button>
          <button
            onClick={() => {
              setDateValue(meta.analysis_date || '');
              setSymbols(meta.symbols || []);
              setSymbolInput('');
              setEditingMeta(false);
            }}
            className="px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700
                       dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditingMeta(true)}
          className="mt-1 flex flex-wrap items-center gap-1.5 cursor-pointer group/meta min-h-[20px]"
          title="Click para editar fecha y símbolos"
        >
          {hasMetadata ? (
            <>
              {meta.analysis_date && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {new Date(meta.analysis_date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
              {meta.symbols?.map((s) => (
                <span key={s}
                  className="text-[11px] px-1.5 py-0 rounded
                             bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-mono">
                  {s}
                </span>
              ))}
            </>
          ) : (
            <span className="text-[11px] text-gray-300 dark:text-gray-600 italic
                             opacity-0 group-hover/meta:opacity-100 transition-opacity">
              + fecha / símbolo
            </span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {viewerImages.length > 0 && (
        <ImageViewer
          images={viewerImages}
          alt="Imagen de nota"
          thumbnailSize="hidden"
          className="hidden"
          externalOpen={viewerOpen}
          onExternalOpenChange={setViewerOpen}
          startIndex={viewerStartIndex}
        />
      )}
    </div>
  );
};

export default NoteImageGalleryBlock;
