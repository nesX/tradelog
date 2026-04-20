import { useState, useRef } from 'react';
import { X, Upload, ImagePlus } from 'lucide-react';
import { useAddImage, useDeleteImage, useUpdateImageCaption } from '../../hooks/useNotes.js';
import ImageViewer from '../common/ImageViewer.jsx';
import { compressImage } from '../../utils/imageCompression.js';
import { useToast } from '../common/Toast.jsx';

const MAX_SIZE_BEFORE_COMPRESSION = 5 * 1024 * 1024; // 5MB

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Convierte las imágenes de la nota al formato que espera ImageViewer:
 * { filename: string }
 */
const toViewerFormat = (images) =>
  (images || []).map((img) => ({ filename: img.image_path, id: img.id }));

const NoteImageGalleryBlock = ({ block, noteId }) => {
  const addImage = useAddImage();
  const deleteImage = useDeleteImage();
  const updateCaption = useUpdateImageCaption();
  const fileInputRef = useRef(null);
  const toast = useToast();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [editCaptionId, setEditCaptionId] = useState(null);
  const [captionValue, setCaptionValue] = useState('');

  const images = block.images || [];
  const viewerImages = toViewerFormat(images);

  /* ---------- handlers ---------- */

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

  const openCaptionEdit = (e, img) => {
    e.stopPropagation();
    setEditCaptionId(img.id);
    setCaptionValue(img.caption || '');
  };

  const saveCaption = (imageId) => {
    updateCaption.mutate({ imageId, caption: captionValue, noteId });
    setEditCaptionId(null);
  };

  /* ---------- render ---------- */

  return (
    <div className="py-2 px-1">

      {/* Tira horizontal de thumbnails — sólo si hay imágenes */}
      {images.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 mb-3">
          {images.map((img, idx) => (
            <div key={img.id} className="group flex-shrink-0 flex flex-col items-center gap-1">

              {/* Thumbnail */}
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
                    alt={img.caption || `Imagen ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {/* Overlay hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                </button>

                {/* Botón eliminar — esquina superior derecha */}
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

              {/* Caption editable */}
              <div className="w-24">
                {editCaptionId === img.id ? (
                  <input
                    autoFocus
                    value={captionValue}
                    onChange={(e) => setCaptionValue(e.target.value)}
                    onBlur={() => saveCaption(img.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveCaption(img.id);
                      if (e.key === 'Escape') setEditCaptionId(null);
                    }}
                    className="w-full text-xs text-center bg-transparent border-b border-blue-400
                               outline-none text-gray-700 dark:text-gray-300 py-0.5"
                    placeholder="Caption..."
                    maxLength={200}
                  />
                ) : (
                  <p
                    onClick={(e) => openCaptionEdit(e, img)}
                    className="text-xs text-center text-gray-500 dark:text-gray-400 truncate
                               cursor-pointer hover:text-gray-700 dark:hover:text-gray-200
                               transition-colors leading-tight"
                    title={img.caption || 'Click para agregar caption'}
                  >
                    {img.caption || (
                      <span className="italic opacity-40">caption...</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Botón agregar — al final de la tira */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
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
            <span className="text-xs text-transparent select-none">·</span>
          </div>
        </div>
      )}

      {/* Zona de upload vacía — sólo si no hay imágenes */}
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

      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ImageViewer reutilizado del trade — se abre con la imagen clickeada */}
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
