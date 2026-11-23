# Arquitectura — Frontend

React 18 + Vite 5 + TanStack Query 5 + Tailwind 3 + react-router 6. ES Modules.

Punto de entrada: `trading-journal/frontend/src/main.jsx` → `App.jsx`.

## Estructura de carpetas

```
trading-journal/frontend/
├── src/
│   ├── main.jsx              # ReactDOM root + StrictMode
│   ├── App.jsx               # QueryClientProvider + ThemeProvider + AuthProvider + ToastProvider + Router
│   ├── api/
│   │   ├── client.js         # axios instance + interceptors
│   │   └── endpoints.js      # funciones que llaman apiClient (76+ endpoints)
│   ├── contexts/
│   │   ├── AuthContext.jsx   # token, user, login, logout
│   │   └── ThemeContext.jsx  # dark/light + persistencia localStorage
│   ├── hooks/                # 11 hooks, todos sobre TanStack Query
│   │   ├── useTrades.js
│   │   ├── useStats.js
│   │   ├── useNotes.js
│   │   ├── useBacktest.js
│   │   ├── useReview.js
│   │   ├── useUsers.js
│   │   ├── useSystems.js
│   │   ├── useTimeframes.js
│   │   ├── useImageUpload.js
│   │   ├── useBlockFollowUp.js
│   │   └── useSectionCollapsed.js
│   ├── pages/
│   │   ├── Home.jsx              # tabla de trades + filtros + stats lateral
│   │   ├── CreateTrade.jsx
│   │   ├── Stats.jsx             # 6 queries paralelas, sin charts
│   │   ├── Settings.jsx
│   │   ├── Login.jsx             # Google OAuth button
│   │   ├── Notes.jsx + NoteEditor.jsx
│   │   ├── Review.jsx            # bloques marcados como follow-up
│   │   ├── Backtest.jsx + BacktestNew.jsx + BacktestSession.jsx
│   │   └── admin/Users.jsx
│   ├── components/
│   │   ├── auth/             # ProtectedRoute, AdminRoute, Login
│   │   ├── common/           # Button, Modal, Input, Loading, Toast, ImageViewer (12KB)
│   │   ├── layout/           # Layout, Header
│   │   ├── trades/           # TradeTable, TradeRow, CreateTradeForm, TradeFilters
│   │   ├── notes/            # ~18 componentes (NoteTree, NoteBlockList, etc.)
│   │   ├── backtest/
│   │   └── admin/
│   ├── utils/
│   │   ├── imageCompression.js   # webp, max 1920px, skip <80KB
│   │   ├── formatters.js
│   │   ├── referenceLinks.js
│   │   ├── notesGrouping.js
│   │   └── treeManipulation.js   # optimistic updates para DnD de notas
│   ├── constants/
│   │   ├── imageConfig.js
│   │   └── tradeConstants.js
│   └── styles/
│       └── globals.css           # @tailwind directives
├── index.html
├── nginx.conf                    # SPA fallback, gzip
├── Dockerfile (dev) + Dockerfile.prod (build + nginx)
├── vite.config.js                # proxy /api → :5000 en dev
├── tailwind.config.js
└── package.json
```

## Cliente HTTP — `api/client.js`

axios + dos interceptors:

```js
// Request: agrega Bearer token desde localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: unwrap response.data, formatear errores, 401 → logout + redirect
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorResponse = { message: '...', code: 'NETWORK_ERROR', details: null, status };
    if (error.response?.data?.error) { /* extraer */ }
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // recuerda adónde volver (p. ej. /recordatorios?card=… al tocar una notificación)
      if (pathname !== '/login') window.location.href = `/login?next=${encodeURIComponent(pathname + search)}`;
    }
    return Promise.reject(errorResponse);
  }
);
```

`baseURL` viene de `import.meta.env.VITE_API_URL` (embedded en build).

Tras el login, `Login.jsx` vuelve a `state.from` (de `ProtectedRoute`) o a `?next=`, siempre pasado por `utils/safeNext.js`: solo rutas de la propia app, nunca una redirección abierta.

## TanStack Query

Configurado en `App.jsx`:

```js
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30000 },
    mutations: { retry: 0 },
  },
});
```

**No hay persistencia entre sesiones** — al recargar, el cache se reinicia. Esto es una de las palancas que activa el plan offline-first ([`../analysis/offline-strategy.md`](../analysis/offline-strategy.md#capa-1--cache-persistente-1-2-días)).

### Patrón de query keys

Factory por dominio para evitar typos y permitir invalidaciones quirúrgicas. Ejemplo en `useTrades.js`:

```js
export const tradeKeys = {
  all: ['trades'],
  lists: () => [...tradeKeys.all, 'list'],
  list: (filters) => [...tradeKeys.lists(), filters],
  details: () => [...tradeKeys.all, 'detail'],
  detail: (id) => [...tradeKeys.details(), id],
  symbols: () => [...tradeKeys.all, 'symbols'],
};
```

Y invalidación tras una mutación:

```js
const queryClient = useQueryClient();
useMutation({
  mutationFn: createTrade,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: tradeKeys.all }),
});
```

## Routing — `App.jsx`

`<BrowserRouter>` con rutas:

| Path | Componente | Guard |
|------|------------|-------|
| `/login` | `Login` | público |
| `/` | `Home` | `ProtectedRoute` |
| `/create` | `CreateTrade` | `ProtectedRoute` |
| `/stats` | `Stats` | `ProtectedRoute` |
| `/settings` | `Settings` | `ProtectedRoute` |
| `/notes`, `/notes/:id` | `Notes` | `ProtectedRoute` |
| `/review` | `Review` | `ProtectedRoute` |
| `/backtest` | `Backtest` | `ProtectedRoute` |
| `/backtest/new`, `/backtest/:id`, `/backtest/:id/continue` | Backtest* | `ProtectedRoute` |
| `/admin/users` | `Users` | `AdminRoute` (role: admin / super_admin) |

**No hay code splitting / lazy routes** — todo entra en un bundle único. Para datasets más grandes esto será un punto de optimización trivial (`React.lazy()` + `<Suspense>`).

`ProtectedRoute` y `AdminRoute` viven en `components/auth/`; consultan `AuthContext` y redirigen a `/login` si falta token o el rol no califica.

## Contexts

### `AuthContext.jsx`

- Estado: `{ user, token, loading }`.
- `login(token, user)`: guarda token en `localStorage`, setea user.
- `logout()`: limpia, llama `POST /api/auth/logout` (best-effort).
- Al montar: si hay token en localStorage, llama `GET /api/auth/me` para hidratar `user`.

### `ThemeContext.jsx`

- Persiste `theme` (`dark` | `light`) en localStorage.
- Aplica `class="dark"` al `<html>` para activar variantes de Tailwind.
- Default: prefiere `prefers-color-scheme`.

## Hooks por dominio

Cada hook expone consultas y mutaciones del dominio. Ejemplo: `useTrades.js`:

- `useTrades(filters)` — `GET /api/trades` con filtros.
- `useTrade(id)` — detalle.
- `useSymbols()` — distinct symbols del usuario.
- `useCreateTrade()` — mutation.
- `useUpdateTrade()`, `useDeleteTrade()`.
- `useImportCsvPreview()`, `useImportCsv()`.

Convención: cada `use*` exporta tanto queries como mutaciones del dominio. Mantener factory de keys `<dominio>Keys` para invalidaciones consistentes.

## Compresión de imágenes — `utils/imageCompression.js`

Antes de subir:

- Skip si MIME no es compresible o `file.size < 80KB` (`config.skipIfSmallerThan`).
- Carga `createImageBitmap(file)` (fallback a `Image()` + URL.createObjectURL).
- Reescala a `maxDimension: 1920` manteniendo aspect ratio.
- Renderea a canvas y exporta a WebP con `quality: 0.85`.
- Si el resultado es más grande que el original, devuelve el original.
- Devuelve un `File` nuevo con extensión `.webp` y `lastModified` actual.

Esto **descarga al servidor** de procesar imágenes: ya no necesitamos `sharp` en backend (aunque sigue siendo recomendable para generar thumbnails — ver [scaling](../analysis/scaling.md#fase-3--almacenamiento-de-imágenes)).

## PWA y service worker — `src/sw.js`

`vite-plugin-pwa` con `strategies: 'injectManifest'`: el SW es nuestro (`src/sw.js`) y el plugin le inyecta la lista de precache y lo bundlea con Vite. Lo registra `registerSW.js` (en el `load` de la página) con `registerType: 'autoUpdate'`: el SW nuevo toma el control sin esperar y la siguiente carga ya sirve el build nuevo.

- **Lo de siempre**: precache del shell (`cleanupOutdatedCaches` + `precacheAndRoute`), `NavigationRoute` a `/index.html` con `/api` excluido, `skipWaiting` + `clientsClaim`. Sin `runtimeCaching`: no se cachean datos de la API.
- **Notificaciones push**: `push` muestra el aviso con `utils/pushNotification.js` (que usa los textos de las tarjetas, `utils/notificationText.js`) y avisa a las ventanas (`notifications-changed`). `notificationclick` enfoca la app y le pide navegar (`navigate`), o la abre en la URL.
- **Regla**: nada de lo que importa `sw.js` puede tocar `window`, `document` ni `localStorage` al cargarse; si no, el SW nuevo falla al instalarse y los dispositivos se quedan con el frontend viejo. Lo comprueban los tests de `utils/` en Node.
- Solo existe en el build: `npm run build && npm run preview` (o `devOptions.enabled` en `vite.config.js`). En `npm run dev` la sección de avisos muestra "solo funcionan en la app compilada".

### Avisos en este dispositivo

- `components/notifications/PushToggle.jsx` (en `/recordatorios`) + `hooks/usePushSubscription.js`: estado de **este** dispositivo y el interruptor para vincularlo a la cuenta. Vincular es siempre manual.
- `PushBridge` en `App.jsx` (uno para toda la app; cada ruta tiene su propio `Layout`): con sesión, `usePushSync` mantiene vivo el dispositivo que la cuenta vinculó y lo desvincula de cualquier otra; siempre, `useServiceWorkerMessages` atiende los mensajes del SW.
- Spec: [`notificaciones-push-pwa.md`](../features/specs/notificaciones-push-pwa.md).

## Build y deploy

- Dev: `npm run dev` → Vite con HMR + proxy `/api` → `http://localhost:5000`.
- Prod: `npm run build` genera `dist/`. `Dockerfile.prod` es multi-stage: build con Node 20, sirve con `nginx:alpine` (config en `nginx.conf` — SPA fallback con `try_files`, gzip).
- **Variables `VITE_*` se embeben en el bundle en build-time**, no son de runtime. Esto importa al pasar `VITE_GOOGLE_CLIENT_ID` por `build.args` en `docker-compose.prod.yml`. Ver [`../operations/troubleshooting.md`](../operations/troubleshooting.md).

## Gaps actuales (resumen)

- ❌ No hay code splitting / lazy routes.
- ⚠️ PWA instalable con service worker propio (precache del shell y notificaciones push), pero sin caché de datos de la API ni IndexedDB.
- ⚠️ Solo tests de utilidades puras (`node --test` en `src/utils/*.test.js`); sin tests de componentes.
- ❌ Stats page hace 6 fetches en paralelo y no se invalida cuando se crea/edita un trade (ver TODO conocido en CLAUDE.md).
- ❌ No hay manejo global de errores fuera de toasts puntuales.

Ver propuestas en [`../analysis/offline-strategy.md`](../analysis/offline-strategy.md) y [`../analysis/scaling.md`](../analysis/scaling.md).
