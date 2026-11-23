import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // SW propio (src/sw.js) para las notificaciones push; el plugin le inyecta el
      // precache. Con injectManifest el bloque `workbox` se ignora: sus opciones
      // viven en `injectManifest` y en el propio sw.js.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js', // sale como /sw.js: nginx lo sirve con no-cache
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Tradelog',
        short_name: 'Tradelog',
        description: 'Registra y analiza tus operaciones de trading',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#2563eb',
        background_color: '#111827',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // navigateFallback (+ denylist de /api) y cleanupOutdatedCaches: en src/sw.js.
        // Sin runtimeCaching: no se cachean datos de la API (offline de datos = decisión aparte).
      },
      // true solo para probar el SW con `npm run dev`
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  server: {
    port: 5179,
    proxy: {
      '/api': {
        target: 'http://localhost:3088',
        changeOrigin: true,
      },
    },
  },
});
