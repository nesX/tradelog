import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, Maximize2, Minimize2, X } from 'lucide-react';
import Modal from './Modal.jsx';

/**
 * Componente para visualizar múltiples imágenes con modal de galería
 */
const ImageViewer = ({
  images = [],
  alt = 'Imagen',
  thumbnailSize = 'h-12 w-12',
  className = '',
  notes = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Manejar caso de imagen única (compatibilidad con código anterior)
  const imageList = Array.isArray(images) ? images : images ? [images] : [];

  if (imageList.length === 0) {
    return (
      <div className={`${thumbnailSize} bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center ${className}`}>
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

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const closeAll = () => {
    setIsFullscreen(false);
    setIsOpen(false);
  };

  // Manejar teclas en pantalla completa
  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'Escape':
          closeFullscreen();
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isFullscreen, closeFullscreen]);

  const firstImage = imageList[0];
  const firstImageUrl = getImageUrl(firstImage);

  if (!firstImageUrl || imageErrors[0]) {
    return (
      <div className={`${thumbnailSize} bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center ${className}`}>
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
        className={`${thumbnailSize} relative group rounded overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-colors ${className}`}
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
          {/* Botón pantalla completa */}
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 z-10 p-2 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full text-white transition-all"
            title="Ver en pantalla completa"
          >
            <Maximize2 className="w-5 h-5" />
          </button>

          {/* Imagen actual */}
          <div className="flex justify-center items-center min-h-[300px]">
            <img
              src={getImageUrl(imageList[currentIndex])}
              alt={`${alt} ${currentIndex + 1}`}
              className="max-h-[70vh] object-contain rounded-lg cursor-pointer"
              onError={() => handleImageError(currentIndex)}
              onClick={toggleFullscreen}
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

        {/* Notas del trade */}
        {notes && (
          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Notas:</p>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{notes}</p>
          </div>
        )}

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

      {/* Overlay de pantalla completa */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          {/* Controles superiores */}
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <button
              onClick={toggleFullscreen}
              className="p-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full text-white transition-all"
              title="Salir de pantalla completa"
            >
              <Minimize2 className="w-6 h-6" />
            </button>
            <button
              onClick={closeAll}
              className="p-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full text-white transition-all"
              title="Cerrar"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Contador de imágenes */}
          <div className="absolute top-4 left-4 text-white text-lg font-medium bg-black bg-opacity-50 px-3 py-1 rounded-full">
            {currentIndex + 1} / {imageList.length}
          </div>

          {/* Imagen en pantalla completa */}
          <img
            src={getImageUrl(imageList[currentIndex])}
            alt={`${alt} ${currentIndex + 1}`}
            className="max-h-screen max-w-screen object-contain p-4"
            onError={() => handleImageError(currentIndex)}
          />

          {/* Controles de navegación */}
          {imageList.length > 1 && (
            <>
              <button
                onClick={goToPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full text-white transition-all"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>

              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full text-white transition-all"
              >
                <ChevronRight className="w-8 h-8" />
              </button>

              {/* Thumbnails en la parte inferior */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black bg-opacity-50 p-2 rounded-lg max-w-[90vw] overflow-x-auto">
                {imageList.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                      index === currentIndex
                        ? 'border-white'
                        : 'border-transparent hover:border-gray-400 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={getImageUrl(image)}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Instrucciones */}
          <div className="absolute bottom-4 right-4 text-white text-sm opacity-50">
            ESC para salir | Flechas para navegar
          </div>
        </div>
      )}
    </>
  );
};

export default ImageViewer;
