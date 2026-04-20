# Implementación: Compresión de imágenes a WebP en el frontend

## Objetivo

Agregar compresión automática a WebP de todas las imágenes que se suban desde el frontend (trades y notas), con calidad y dimensiones configurables a nivel de aplicación. La compresión se hace en el navegador usando `canvas.toBlob()` antes de enviar al backend.

## Contexto

- Frontend: React 18 + Vite (ES modules, JavaScript puro)
- Hook existente a modificar: `frontend/src/hooks/useImageUpload.js`
- Backend (multer) ya recibe imágenes; solo hay que verificar que acepte `image/webp` en el mimetype filter.

---

## Archivos a crear

### 1. `frontend/src/constants/imageConfig.js`

Archivo de configuración centralizada. Crear con el siguiente contenido:

```js
/**
 * Configuración de compresión de imágenes a WebP.
 * Ajustar estos valores cambia el comportamiento en toda la aplicación
 * (uploads de trades, notas, y cualquier futuro módulo que use useImageUpload).
 */
export const IMAGE_COMPRESSION = {
  // Calidad WebP: 0.0 a 1.0. Equivalente a `cwebp -q` (0.85 ≈ -q 85).
  // 0.85 es un buen balance calidad/tamaño para screenshots de trading.
  quality: 0.85,

  // Lado máximo (ancho o alto) en píxeles. Si la imagen excede esto,
  // se redimensiona manteniendo aspect ratio. Null = no redimensionar.
  maxDimension: 1920,

  // Si el archivo original pesa menos que esto (en bytes), se sube sin
  // comprimir. Evita trabajo innecesario en imágenes ya pequeñas.
  skipIfSmallerThan: 100_000, // 100 KB

  // Tipos MIME que se intentarán comprimir. Otros se suben tal cual.
  compressibleMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};
```

### 2. `frontend/src/utils/imageCompression.js`

Utilidad de compresión. Crear con el siguiente contenido:

```js
import { IMAGE_COMPRESSION } from '../constants/imageConfig.js';

/**
 * Comprime una imagen a WebP usando canvas.
 *
 * @param {File} file - Archivo original del input.
 * @param {Object} [options] - Overrides de IMAGE_COMPRESSION (opcional).
 * @returns {Promise<File>} Archivo comprimido (o el original si no aplica compresión).
 */
export async function compressImage(file, options = {}) {
  const config = { ...IMAGE_COMPRESSION, ...options };

  // Caso 1: tipo no comprimible (gif, svg, etc.) → devolver original.
  if (!config.compressibleMimeTypes.includes(file.type)) {
    return file;
  }

  // Caso 2: archivo ya es pequeño → no vale la pena comprimir.
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
    bitmap.close?.(); // liberar memoria si es ImageBitmap

    const blob = await canvasToBlob(canvas, 'image/webp', config.quality);

    // Fallback: si por alguna razón el webp pesa MÁS que el original,
    // devolver el original (raro pero posible en imágenes muy chicas o ya optimizadas).
    if (blob.size >= file.size) {
      return file;
    }

    const newName = replaceExtension(file.name, 'webp');
    return new File([blob], newName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    // Fallback explícito: si algo falla, subir el archivo original.
    // El usuario no debería sufrir por un bug de compresión.
    console.warn('[imageCompression] Falló la compresión, subiendo original:', err);
    return file;
  }
}

/**
 * Carga un File como ImageBitmap (más rápido que Image + onload).
 * Cae a HTMLImageElement si el navegador no soporta createImageBitmap.
 */
async function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  // Fallback para navegadores viejos
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

/**
 * Calcula dimensiones destino manteniendo aspect ratio.
 * Si maxDimension es null o la imagen ya entra, devuelve las dimensiones originales.
 */
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

/**
 * Envuelve canvas.toBlob en una promesa.
 */
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

/**
 * Cambia la extensión de un nombre de archivo.
 * "screenshot.png" + "webp" → "screenshot.webp"
 */
function replaceExtension(filename, newExt) {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return `${filename}.${newExt}`;
  return `${filename.slice(0, dotIndex)}.${newExt}`;
}
```

---

## Archivos a modificar

### 3. `frontend/src/hooks/useImageUpload.js`

Integrar `compressImage` antes de enviar el archivo al backend. **No cambiar la firma pública del hook** — los componentes que lo consumen no deben notar la diferencia.

Cambios requeridos:

1. Importar la utilidad al inicio del archivo:
   ```js
   import { compressImage } from '../utils/imageCompression.js';
   ```

2. En la función de upload (antes de armar el `FormData` y llamar a axios), reemplazar el `file` recibido por el resultado de `compressImage(file)`:
   ```js
   const compressedFile = await compressImage(file);
   // Desde aquí en adelante, usar `compressedFile` en lugar de `file`
   // al construir el FormData
   ```

3. Si el hook maneja un estado de loading/uploading, agregar un flag opcional `isCompressing` o simplemente englobar la compresión dentro del mismo estado de "subiendo" (más simple). **Recomendación: mantenerlo simple** — la compresión es rápida (<2s en imágenes grandes) y cae bajo el mismo spinner de upload.

4. Si el hook procesa múltiples archivos (upload múltiple para gallery blocks de notas), aplicar `compressImage` a cada uno con `Promise.all`:
   ```js
   const compressedFiles = await Promise.all(files.map((f) => compressImage(f)));
   ```

---

## Verificación en backend

### 4. `backend/src/middleware/upload.js`

**No requiere cambios si ya acepta `image/webp`**, pero hay que verificarlo. Revisar el filtro de mimetype de multer (`fileFilter`) y confirmar que `image/webp` esté en la lista permitida. Si no está, agregarlo junto a `image/jpeg` y `image/png`.

---

## Testing manual (checklist para Fernando después de implementar)

1. Subir un screenshot de TradingView (>500KB JPEG) en un trade → verificar en `backend/uploads/` que el archivo guardado sea `.webp` y pese significativamente menos.
2. Subir un PNG chico (<100KB) → verificar que se suba sin comprimir (se salta por `skipIfSmallerThan`).
3. Subir una imagen enorme (4000×3000) → verificar que se redimensione a 1920px del lado mayor.
4. Subir un GIF → verificar que se suba tal cual (no está en `compressibleMimeTypes`).
5. Probar en el gallery block de notas con múltiples imágenes a la vez → verificar que todas se procesen.
6. Abrir una imagen comprimida en el ImageViewer → verificar que se vea bien (calidad 0.85 no debería tener artefactos visibles en screenshots).

---

## Notas de diseño

- **Por qué en `utils/` y no en `hooks/`**: `compressImage` es una función pura (sin estado React), reutilizable desde cualquier contexto. Ponerla en `utils/` deja claro que no depende del ciclo de vida del componente.
- **Por qué configuración en `constants/imageConfig.js` y no dentro de la utilidad**: permite ajustar calidad sin tocar la lógica. Si más adelante se decide exponer esto como setting de usuario (guardado en DB por `user_id`), solo hay que cambiar la fuente de los valores — la utilidad acepta `options` como override.
- **Por qué fallback al archivo original en caso de error**: la compresión es una optimización, no una feature crítica. Si falla, el upload debe seguir funcionando. El `console.warn` deja rastro para debugging.
- **Por qué verificar `blob.size >= file.size`**: en imágenes ya optimizadas o muy chicas, el webp puede salir más grande que el original. El fallback evita empeorar las cosas.