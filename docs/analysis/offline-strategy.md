# Análisis de estrategia offline-first y compute en cliente

> **Audiencia**: el dueño del proyecto, evaluando cómo (a) permitir uso offline, y (b) descargar al servidor moviendo cómputo al cliente.

> Este documento es **diseño + análisis de viabilidad**, no un plan de implementación inmediato. La decisión final sobre qué capas implementar depende de las respuestas a las preguntas listadas al final y de cómo crezca la base de usuarios.

---

## Resumen ejecutivo (TL;DR)

- El estado actual del frontend es **buen punto de partida**: ya hace compresión de imágenes client-side y reconstruye el árbol de notas en cliente. Pero **cero PWA / IndexedDB / service worker**.
- La estrategia recomendada es **incremental por capas**, NO un rewrite. Las dos primeras capas (cache persistente + service worker básico) dan el ~60% del beneficio en 3-5 días sin tocar la lógica de negocio.
- **Stats es la fruta más baja**: el backend ejecuta agregaciones SQL costosas que en cliente son `Array.reduce` triviales. Mover stats al cliente elimina 6 endpoints del hot path.
- **Sync bidireccional (creación offline) es la fase más arriesgada** — añade superficie de bugs significativa. Las Capas 1-3 ya dan offline-read excelente; la Capa 4 (sync) solo si el caso de uso lo justifica.
- **Notas son la peor candidata** para offline: jerarquía + fractional indexing + bloques tipados + búsqueda FTS. En la primera iteración, mantenerlas **online-only**.

---

## Estado actual

| Capa | Estado |
|------|--------|
| Service worker | ❌ No existe |
| Manifest PWA | ❌ No existe |
| IndexedDB / Dexie | ❌ No usado |
| Cache de TanStack Query persistente | ❌ Solo en memoria (`staleTime=30s`) |
| Compresión de imágenes client-side | ✅ webp, max 1920px, quality 0.85 |
| Construcción de árbol de notas client-side | ✅ `buildTree` en `useNotes.js` |
| Optimistic updates en DnD de notas | ✅ `treeManipulation.js` |
| Stats en cliente | ❌ Todo server-side (6 endpoints) |
| Filtrado/sorting de trades en cliente | ❌ Todo server-side |
| CSV preview en cliente | ❌ Backend hace todo el parsing |

Lo que ya funciona client-side es **positivo**: prueba que el proyecto puede absorber lógica en el navegador sin problemas.

---

## Casos de uso y prioridad

Una matriz simplificada — más alto = más valor por menos complejidad:

| Caso de uso | Valor | Complejidad | Prioridad |
|-------------|-------|-------------|-----------|
| Lectura offline de trades pasados | Alto | Baja | ⭐⭐⭐ |
| Filtrado/búsqueda local de trades | Alto | Media | ⭐⭐⭐ |
| Stats agregadas en cliente | Alto (descarga server) | Media | ⭐⭐⭐ |
| CSV preview 100% client-side | Medio | Baja | ⭐⭐ |
| Instalable (PWA shell) en móvil | Medio | Baja | ⭐⭐ |
| Visualización offline de notas | Medio | Alta | ⭐ |
| Creación offline de trades (con sync) | Alto | Muy alta | ⚠ pesar mucho |
| Edición offline de notas | Bajo (use-case raro) | Extrema | ❌ no recomendado |

---

## Diseño recomendado — 4 capas

Las capas son **acumulativas**: cada una se construye sobre la anterior. Podés parar después de cualquiera.

### Capa 1 — Cache persistente de TanStack Query

**Objetivo**: que al recargar o cerrar/abrir el navegador, la app aparezca **instantáneamente** con datos cacheados antes de revalidar.

**Esfuerzo**: 1-2 días.

**Implementación**:

```bash
npm install @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister idb-keyval
```

```js
// frontend/src/main.jsx (o App.jsx)
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'tradelog-query-cache',
});

<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
>
  ...
</PersistQueryClientProvider>
```

Eso es todo. Sin reescribir hooks.

**Resultado**:
- Refresh inmediato con datos del IDB → fetch en background → reconcilia.
- Datos válidos hasta 24h sin red (configurable).
- Si la URL cambia (e.g. un endpoint con nueva forma de respuesta), invalidar el cache con un version key.

**Limitaciones**:
- Solo cachea queries que ya se ejecutaron al menos una vez. No es "todos los datos" — es "lo que el usuario miró".
- Mutaciones no se persisten (eso es la Capa 4).

---

### Capa 2 — Service Worker + PWA shell

**Objetivo**: app **instalable** en móvil y desktop. Assets estáticos servidos desde cache. Algunas APIs con cache-first.

**Esfuerzo**: 2-3 días.

**Implementación**:

```bash
npm install -D vite-plugin-pwa
```

```js
// frontend/vite.config.js
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Trading Journal',
        short_name: 'tradelog',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          {
            urlPattern: /^.*\/api\/trades$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'trades-cache' },
          },
          {
            urlPattern: /^.*\/api\/images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
```

**Resultado**:
- App instalable en cualquier dispositivo.
- Recarga sin red muestra el shell completo.
- Imágenes cacheadas en el navegador, no se vuelven a pedir (combina perfecto con `Cache-Control: immutable` que sugiere `scaling.md`).
- `/api/trades` con stale-while-revalidate: muestra cached + revalida en background.

**Trade-offs**:
- Workbox auto-update puede ser confuso (la versión vieja queda hasta cerrar/reabrir). Configurar prompt al usuario para forzar update.
- Cache puede servirte datos viejos durante 30s — aceptable para trades.

---

### Capa 3 — Datos locales con IndexedDB (Dexie)

**Objetivo**: una réplica local del dataset del usuario. Stats / filtros / búsqueda → 100% en cliente.

**Esfuerzo**: 1-2 semanas.

**Implementación con `Dexie.js`**:

```bash
npm install dexie
```

```js
// frontend/src/db/dexie.js
import Dexie from 'dexie';

export const db = new Dexie('tradelog');
db.version(1).stores({
  trades: 'id, user_id, symbol, entry_date, exit_date, status, trade_type, [symbol+entry_date]',
  trade_images: 'id, trade_id',
  meta: 'key',  // last_sync, etc.
});
```

**Patrón en hooks**:

```js
// useTrades.js
export const useTrades = (filters) => {
  return useQuery({
    queryKey: tradeKeys.list(filters),
    queryFn: async () => {
      // 1. Leer de Dexie sincronicamente
      const local = await db.trades
        .filter(t => matchesFilters(t, filters))
        .sortBy('entry_date');

      // 2. Disparar fetch al server (en paralelo)
      const remote = await endpoints.listTrades(filters);

      // 3. Reconciliar: server gana en conflictos
      await db.transaction('rw', db.trades, async () => {
        for (const t of remote.trades) {
          await db.trades.put(t);
        }
      });

      return remote;
    },
    initialData: () => /* leer Dexie inicialmente */,
  });
};
```

**Para stats — eliminar 6 endpoints del hot path**:

```js
// useStats.js — TODO en cliente
export const useGeneralStats = () => useQuery({
  queryKey: ['stats', 'general'],
  queryFn: async () => {
    const trades = await db.trades.where('status').equals('CLOSED').toArray();
    const closed = trades.filter(t => t.pnl != null);
    return {
      total_trades: trades.length,
      winning_trades: closed.filter(t => t.pnl > 0).length,
      losing_trades: closed.filter(t => t.pnl < 0).length,
      total_pnl: closed.reduce((a, t) => a + Number(t.pnl), 0),
      win_rate: closed.length ? closed.filter(t => t.pnl > 0).length / closed.length * 100 : 0,
      best_trade: Math.max(...closed.map(t => Number(t.pnl))),
      worst_trade: Math.min(...closed.map(t => Number(t.pnl))),
      avg_pnl: closed.length ? closed.reduce((a, t) => a + Number(t.pnl), 0) / closed.length : 0,
    };
  },
});
```

**Beneficios concretos**:

- **Reducción de carga del backend**: 6 endpoints de stats eliminados (o convertidos en backup).
- **Stats instantáneas** tras carga inicial.
- **Filtrado/búsqueda offline** con `db.trades.filter()` o `db.trades.where('symbol').equals('BTCUSDT')`.
- **CSV preview** 100% en cliente (parsing es trivial en JS).

**Trade-offs**:

- **Doble lógica**: las reglas de cálculo viven en backend (SQL) y frontend (JS). Riesgo de divergencia. Mitigación: tests de paridad (corre los dos y compara).
- **Tamaño en IDB**: 10000 trades × ~500 bytes/trade = 5 MB. Aceptable. Notas serán pesadas si se sincronizan (cada bloque puede tener mucho texto).
- **Storage no garantizado**: Safari purga IDB tras inactividad. Mitigación:
  ```js
  if (navigator.storage?.persist) await navigator.storage.persist();
  ```
  Eso pide al navegador que considere los datos persistentes (no garantizado pero ayuda).

**Sincronización de bajada (server → cliente)**:

- Polling cada N minutos cuando la pestaña está activa.
- En foco/online events, fetch incremental: `GET /api/trades?modified_since=<last_sync>`. El backend devuelve solo lo nuevo. **Requiere endpoint nuevo** y agregar `updated_at` como filtro.
- Para deletes: necesitamos endpoint que devuelva IDs eliminados desde X (e.g. `GET /api/trades/deleted?since=<last_sync>`) o aceptar inconsistencia momentánea.

---

### Capa 4 — Sync con cola de mutaciones (CREACIÓN OFFLINE)

**Objetivo**: el usuario puede crear / editar / eliminar trades sin red, y los cambios se sincronizan al volver online.

**Esfuerzo**: 2-4 semanas.

**Pre-requisito crítico**: migrar IDs de trades a **UUID generados en cliente** (`crypto.randomUUID()`). Hoy son `SERIAL` (asignados por Postgres). Sin UUIDs client-side, el cliente no puede referenciar un trade recién creado offline desde otro contexto (e.g. agregar imagen, referenciar desde una nota).

Esto requiere **migración de schema**: añadir columna `uuid UUID DEFAULT gen_random_uuid()`, hacerla UNIQUE NOT NULL, idealmente la PK (cambio mayor — afecta todas las FKs). Decisión pendiente en [`../pending-decisions.md`](../pending-decisions.md) D-010.

**Diseño**:

```js
// frontend/src/db/dexie.js
db.version(2).stores({
  // ... lo anterior
  outbox: '++id, type, payload, attempts, created_at',  // cola de mutaciones pendientes
});
```

**Wrapper de mutación**:

```js
const useCreateTrade = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (trade) => {
      const localTrade = { ...trade, uuid: crypto.randomUUID(), _pending: true };
      await db.trades.add(localTrade);
      queryClient.invalidateQueries({ queryKey: tradeKeys.all });

      if (navigator.onLine) {
        try {
          const remote = await endpoints.createTrade(trade);
          await db.trades.put({ ...remote, _pending: false });
        } catch (e) {
          // Encolar para retry
          await db.outbox.add({ type: 'CREATE_TRADE', payload: trade, attempts: 0 });
        }
      } else {
        await db.outbox.add({ type: 'CREATE_TRADE', payload: trade, attempts: 0 });
      }
    },
  });
};
```

**Procesador de cola**:

```js
window.addEventListener('online', processOutbox);
async function processOutbox() {
  const pending = await db.outbox.orderBy('created_at').toArray();
  for (const job of pending) {
    try {
      switch (job.type) {
        case 'CREATE_TRADE': await endpoints.createTrade(job.payload); break;
        case 'UPDATE_TRADE': await endpoints.updateTrade(job.payload); break;
        case 'DELETE_TRADE': await endpoints.deleteTrade(job.payload.id); break;
      }
      await db.outbox.delete(job.id);
    } catch (err) {
      if (job.attempts > 5) {
        // Notificar al usuario, dejar la tarea visible para resolución manual
      } else {
        await db.outbox.update(job.id, { attempts: job.attempts + 1 });
      }
    }
  }
}
```

**Resolución de conflictos**:

- **Last-write-wins** (LWW) basado en `updated_at`: si el server tiene una versión más nueva, descartar la del cliente.
- En conflictos detectados (mismo trade modificado en ambos lados), mostrar prompt al usuario con ambas versiones — caro de implementar.
- En la práctica para trades (que normalmente no se editan mucho), LWW es suficiente.

**Riesgos / trade-offs**:

- **Surface de bugs alta**: cualquier cambio en el schema requiere coordinar migración server + cliente.
- **Datos huérfanos**: trade creado offline + imagen subida offline → la imagen referencia un UUID que solo existe localmente hasta sync.
- **Notas son intratables aquí**: jerarquía + fractional indexing + bloques con tipos diferentes → conflictos casi inevitables. **Mantener notas online-only en Capa 4**.

**Recomendación**: implementar Capa 4 SOLO si hay un caso de uso comprobado de usuarios que NECESITAN crear trades offline (e.g. uso en celular en lugares sin señal). Para uso normal con conexión razonable, Capas 1+2+3 ya dan ≥80% del beneficio.

---

## Compute en cliente — qué mover (sin necesidad de offline)

Independiente de la estrategia offline, hay cómputo del backend que **podría hacerse en cliente sin perder nada**:

### Alta prioridad

1. **CSV preview**: `csvParser.service.js` (237 líneas) podría ser una función JS de 80 líneas en el cliente. Validar formato + tipos antes de subir. El endpoint `POST /api/trades/import/preview` quedaría obsoleto.
2. **Ordenamiento de listas**: cuando la lista está en memoria, `Array.sort` es trivial. Hoy se manda `sortBy/sortDir` al backend.
3. **Filtros locales**: una vez cargada la lista, filtrar por símbolo / tipo / rango es 1 línea en JS. Si ya cargué 50 trades en pantalla, filtrar a SHORT no necesita ir al server.

### Media prioridad

4. **Stats** (cuando Capa 3 esté en su lugar): elimina 6 endpoints.
5. **Búsqueda básica en notas** (sin FTS): `Array.filter(t => t.title.includes(q))` para notas locales.
6. **Agregaciones de "review" / "pendientes de seguimiento"**: filtrar bloques con `follow_up_required=true && follow_up_done=false`.

### Lo que NO conviene mover

- **Full-text search de notas**: PG `tsvector` es muy superior a una búsqueda lineal en JS sobre todo el contenido de bloques. Mantener server-side.
- **Validación de seguridad**: cualquier validación que protege la BD (precios > 0, FK existentes, etc.) debe quedar en backend, no en cliente.
- **CSV import "de verdad"**: aunque el preview sea cliente, la inserción debe ser server-side (transacción atómica + validación final).
- **Imagen storage**: el backend sigue siendo dueño del filesystem.

---

## Plan de implementación recomendado

Si solo tenés ~1 semana para invertir, este es el orden:

1. **Capa 1 (cache persistente)** — 1-2 días. Beneficio inmediato visible al usuario.
2. **Capa 2 (PWA shell)** — 2-3 días. "Instalable" da percepción profesional.
3. **CSV preview client-side** — 1 día. Quita peso al backend.
4. **Stats client-side parcial** — 2-3 días. Empezar con `general` (la más usada).

Eso entrega: app instantánea al cargar, instalable, stats sin pegar al server, CSV preview sin red.

Si tenés ~1 mes:

5. **Capa 3 completa (Dexie + sync de bajada)** — 1-2 semanas. Filtrado/búsqueda local, todas las stats migradas.

Si tenés ~2-3 meses Y validás caso de uso de uso offline real:

6. **Capa 4 (sync bidireccional)** — 2-4 semanas. Solo si los usuarios lo piden.

---

## Métricas de éxito

Si la estrategia funciona, deberíamos ver tras Capas 1-3:

- **Reducción de requests al backend**: -50% a -70% en endpoints de stats. -30% en `/api/trades` (porque los filtros se hacen en cliente).
- **First Contentful Paint con cache caliente**: <500ms (hoy >1000ms en cold load por TanStack Query reset).
- **Lectura offline**: trades pasados visibles sin conexión.
- **Tiempo de cómputo en backend (medido en logs)**: -40% (las queries de stats son las más caras).

---

## Trade-offs explícitos

| Decisión | Pro | Contra |
|----------|-----|--------|
| Persistencia IDB | Carga instantánea, soporta offline | Inconsistencia momentánea, cache stale | 
| Stats en cliente | Server descongestionado, instantáneo | Lógica duplicada, riesgo de divergencia | 
| PWA instalable | UX móvil profesional | Configuración de assets (íconos en N tamaños) | 
| Sync bidireccional | Crear offline en lugares sin red | Bugs de conflicto, complejidad mayor | 
| Notas offline | Editar siempre | Modelo de datos lo hace muy difícil de hacer bien |

---

## Decisiones que dependen del dueño

Detalle en [`../pending-decisions.md`](../pending-decisions.md):

- **D-003**: Stats — duplicar en cliente vs nuevo endpoint "raw trades + cliente computa todo".
- **D-004**: Notas — online-only o invertir en sync offline.
- **D-010**: IDs — migrar a UUID client-generated (pre-requisito para Capa 4).
- **D-015** (nuevo): hasta qué tamaño de dataset por usuario aspira la app (define si Dexie + Array.filter alcanza, o si hay que paginar local también).

Ninguna bloquea Capas 1-2. Las respuestas son necesarias antes de Capas 3-4.
