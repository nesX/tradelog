import { IMAGE_COMPRESSION } from '../constants/imageConfig.js';

export async function compressImage(file, options = {}) {
  const config = { ...IMAGE_COMPRESSION, ...options };

  if (!config.compressibleMimeTypes.includes(file.type)) {
    return file;
  }

  if (file.size < config.skipIfSmallerThan) {
    return file;
  }

  try {
    const bitmap = await loadImageBitmap(file);
    const { width, height } = computeTargetDimensions(
      bitmap.width,
      bitmap.height,
      config.maxDimension
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, 'image/webp', config.quality);

    if (blob.size >= file.size) {
      return file;
    }

    const newName = replaceExtension(file.name, 'webp');
    return new File([blob], newName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[imageCompression] Falló la compresión, subiendo original:', err);
    return file;
  }
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen'));
    };
    img.src = url;
  });
}

function computeTargetDimensions(srcWidth, srcHeight, maxDimension) {
  if (!maxDimension || (srcWidth <= maxDimension && srcHeight <= maxDimension)) {
    return { width: srcWidth, height: srcHeight };
  }
  const ratio = Math.min(maxDimension / srcWidth, maxDimension / srcHeight);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob devolvió null'));
      },
      mimeType,
      quality
    );
  });
}

function replaceExtension(filename, newExt) {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return `${filename}.${newExt}`;
  return `${filename.slice(0, dotIndex)}.${newExt}`;
}
