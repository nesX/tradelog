import { useState, useRef } from 'react';
import { Upload, RefreshCw, Trash2 } from 'lucide-react';
import { useAddImage, useDeleteImage } from '../../hooks/useNotes.js';
import ImageViewer from '../common/ImageViewer.jsx';
import { compressImage } from '../../utils/imageCompression.js';
import { useToast } from '../common/Toast.jsx';

const MAX_SIZE_BEFORE_COMPRESSION = 5 * 1024 * 1024; // 5MB

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Bloque de una sola imagen a ancho completo. Subir otra imagen la reemplaza
 * (el backend borra la anterior); click abre el visor.
 */
const NoteImageBlock = ({ block, noteId }) => {
  const addImage = useAddImage();
  const deleteImage = useDeleteImage();
  const fileInputRef = useRef(null);
  const toast = useToast();
  const [viewerOpen, setViewerOpen] = useState(false);

  const image = (block.images || [])[0] || null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(`"${file.name}" no es una imagen (JPG, PNG, WebP o GIF).`);
      return;
    }
    if (file.size > MAX_SIZE_BEFORE_COMPRESSION) {
      toast.error(`"${file.name}" supera el tamaño máximo de 5MB.`);
      return;
    }
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('image', compressed);
      await addImage.mutateAsync({ blockId: block.id, formData, noteId });
    } catch (err) {
      toast.error(err?.message || 'Error al subir la imagen.');
    }
  };

  const pickFile = () => fileInputRef.current?.click();

  return (
    <div className="py-2 px-4">
      {image ? (
        <div className="relative group/img w-fit max-w-full mx-auto">
          <button
            onClick={() => setViewerOpen(true)}
            className="block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-400"
            title="Ver en grande"
          >
            <img
              src={`${API_BASE}/api/images/${image.image_path}`}
              alt="Imagen de nota"
              className="block max-w-full max-h-[70vh] object-contain"
            />
          </button>

          {addImage.isPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Abajo a la derecha: arriba chocaría con los controles flotantes del
              bloque, que en < md se anclan a la esquina superior derecha. */}
          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100
                          touch:opacity-100 transition-opacity">
            <button
              onClick={pickFile}
              disabled={addImage.isPending}
              className="w-7 h-7 flex items-center justify-center rounded-md
                         bg-black/60 hover:bg-black/80 text-white shadow-sm
                         disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cambiar imagen"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => deleteImage.mutate({ imageId: image.id, noteId })}
              disabled={deleteImage.isPending}
              className="w-7 h-7 flex items-center justify-center rounded-md
                         bg-red-500/90 hover:bg-red-600 text-white shadow-sm
                         disabled:opacity-50 disabled:cursor-not-allowed"
              title="Eliminar imagen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={pickFile}
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
              <span className="text-sm font-medium">Agregar imagen</span>
              <span className="text-xs opacity-60">JPG, PNG, WebP, GIF</span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {image && (
        <ImageViewer
          images={[{ filename: image.image_path, id: image.id }]}
          alt="Imagen de nota"
          thumbnailSize="hidden"
          className="hidden"
          externalOpen={viewerOpen}
          onExternalOpenChange={setViewerOpen}
        />
      )}
    </div>
  );
};

export default NoteImageBlock;
