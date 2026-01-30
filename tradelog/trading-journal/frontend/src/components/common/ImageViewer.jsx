import { useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import Modal from './Modal.jsx';

/**
 * Componente para visualizar múltiples imágenes con modal de galería
 */
const ImageViewer = ({
  images = [],
  alt = 'Imagen',
  thumbnailSize = 'h-12 w-12',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState({});

  // Manejar caso de imagen única (compatibilidad con código anterior)
  const imageList = Array.isArray(images) ? images : images ? [images] : [];

  if (imageList.length === 0) {
    return (
      <div className={`${thumbnailSize} bg-gray-100 rounded flex items-center justify-center ${className}`}>
        <span className="text-gray-400 text-xs">Sin imagen</span>
      </div>
    );
  }

  // Construir URL de imagen
  const getImageUrl = (image) => {
    const filename = typeof image === 'string' ? image : image.filename;
    if (!filename) return null;

    if (filename.startsWith('http')) return filename;
    return `${import.meta.env.VITE_API_URL || ''}/api/images/${filename}`;
  };

  const handleImageError = (index) => {
    setImageErrors((prev) => ({ ...prev, [index]: true }));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % imageList.length);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  };

  const firstImage = imageList[0];
  const firstImageUrl = getImageUrl(firstImage);

  if (!firstImageUrl || imageErrors[0]) {
    return (
      <div className={`${thumbnailSize} bg-gray-100 rounded flex items-center justify-center ${className}`}>
        <span className="text-gray-400 text-xs">Error</span>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail */}
      <button
        onClick={() => {
          setCurrentIndex(0);
          setIsOpen(true);
        }}
        className={`${thumbnailSize} relative group rounded overflow-hidden border border-gray-200 hover:border-blue-500 transition-colors ${className}`}
      >
        <img
          src={firstImageUrl}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => handleImageError(0)}
        />
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
          <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>

      {/* Modal con galería */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        size="xl"
        title={`${alt} (${currentIndex + 1}/${imageList.length})`}
      >
        <div className="relative">
          {/* Imagen actual */}
          <div className="flex justify-center items-center min-h-[300px]">
            <img
              src={getImageUrl(imageList[currentIndex])}
              alt={`${alt} ${currentIndex + 1}`}
              className="max-h-[70vh] object-contain rounded-lg"
              onError={() => handleImageError(currentIndex)}
            />
          </div>

          {/* Controles de navegación */}
          {imageList.length > 1 && (
            <>
              <button
                onClick={goToPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full text-white transition-all"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full text-white transition-all"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Indicadores */}
              <div className="flex justify-center mt-4 gap-2">
                {imageList.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentIndex
                        ? 'bg-blue-600 w-4'
                        : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Thumbnails de navegación */}
        {imageList.length > 1 && (
          <div className="flex gap-2 mt-4 overflow-x-auto py-2">
            {imageList.map((image, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                  index === currentIndex
                    ? 'border-blue-500'
                    : 'border-transparent hover:border-gray-300'
                }`}
              >
                <img
                  src={getImageUrl(image)}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={() => handleImageError(index)}
                />
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
};

export default ImageViewer;
