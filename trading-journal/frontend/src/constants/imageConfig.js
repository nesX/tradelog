export const IMAGE_COMPRESSION = {
  quality: 0.85,
  maxDimension: 1920,
  skipIfSmallerThan: 100_000, // 100 KB
  compressibleMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};
