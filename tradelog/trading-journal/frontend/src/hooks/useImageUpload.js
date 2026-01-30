import { useState, useCallback } from 'react';

/**
 * Hook para manejo de upload de múltiples imágenes
 */

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 10;

export const useImageUpload = () => {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState(null);

  /**
   * Valida un archivo
   */
  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `${file.name}: Tipo no permitido. Use JPG, PNG, WebP o GIF.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name}: Excede el tamaño máximo de 5MB.`;
    }
    return null;
  };

  /**
   * Procesa y agrega archivos
   */
  const addFiles = useCallback((newFiles) => {
    setError(null);

    const filesToAdd = Array.from(newFiles);

    // Verificar límite
    if (files.length + filesToAdd.length > MAX_FILES) {
      setError(`Máximo ${MAX_FILES} imágenes permitidas.`);
      return;
    }

    const validFiles = [];
    const newPreviews = [];
    const errors = [];

    for (const file of filesToAdd) {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      // Evitar duplicados
      const isDuplicate = files.some(
        (f) => f.name === file.name && f.size === file.size
      );
      if (isDuplicate) {
        continue;
      }

      validFiles.push(file);

      // Crear preview
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push({
          id: `${Date.now()}-${file.name}`,
          file,
          url: reader.result,
        });

        if (newPreviews.length === validFiles.length) {
          setPreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    }

    if (errors.length > 0) {
      setError(errors.join(' '));
    }

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  }, [files]);

  /**
   * Maneja el evento de cambio del input file
   */
  const handleInputChange = useCallback((event) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      addFiles(selectedFiles);
    }
    // Reset input para permitir seleccionar el mismo archivo
    event.target.value = '';
  }, [addFiles]);

  /**
   * Maneja el drop de archivos
   */
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [addFiles]);

  /**
   * Previene el comportamiento por defecto del drag
   */
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  /**
   * Elimina un archivo por índice
   */
  const removeFile = useCallback((index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  /**
   * Limpia todos los archivos
   */
  const clearFiles = useCallback(() => {
    setFiles([]);
    setPreviews([]);
    setError(null);
  }, []);

  return {
    files,
    previews,
    error,
    handleInputChange,
    handleDrop,
    handleDragOver,
    removeFile,
    clearFiles,
    addFiles,
  };
};
