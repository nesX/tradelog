# Task: frontend — capa de datos, `ReminderModal` y toggle de bloque
2026-11-22 · Frontend · Recordatorios de análisis 8/11 · Depende de: 019, 020

Spec: §5.1 (modal y toggle) y §5.3 de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Crear, editar y borrar alertas de precio y recordatorios por fecha desde un
bloque, con el precio actual a la vista y sin que el navegador hable con
Binance.

## Alcance

### 1. Capa de datos (§5.3)
- `api/endpoints.js`: las 13 funciones nuevas (catálogo 2, alertas 4,
  recordatorios 4, tarjetas 3).
- Hooks con factory de keys, patrón de `hooks/useRevisit.js`:
  - `useMarketSymbols.js`: `useMarketSymbols()` (`staleTime` 10 min) y
    `useSymbolPrice(symbol)` (`staleTime` 30 s y `refetchInterval` 30 s,
    `enabled` solo con el modal abierto y un símbolo elegido; la caché del
    backend es de 60 s, así que Binance sigue viendo una petición por minuto
    como mucho).
  - `usePriceAlerts.js` y `useDateReminders.js`: listas por estado y
    mutaciones que invalidan `noteKeys.detail(noteId)`, `notificationKeys` y
    las listas de Programadas.
  - `useNotifications.js`: `notificationKeys`, `useNotifications(status)`,
    `useNotificationCount()` (`refetchInterval: 5 * 60_000` y
    `refetchOnWindowFocus: true`, solo en esta query) y
    `useResolveNotification()`. Lo usa la página de la task 025; va aquí porque
    las mutaciones de esta task ya invalidan sus keys.

### 2. `components/notes/ReminderModal.jsx`
- Sobre `components/common/Modal.jsx`, que no tiene variante de pantalla
  completa (`size="full"` es `max-w-full mx-4`, centrado): añadir una que en
  `< sm` ocupe toda la pantalla y en desktop quede en `max-w-lg`.
- Pestañas **Precio** y **Fecha**. Modos crear, editar, re-armar y
  re-programar, precargados por props (las tarjetas de la task 025 también lo
  abren).
- **Símbolo** (puede ir en su propio `SymbolCombobox.jsx`): filtra por `symbol`
  y `base_asset` (`sol` encuentra `SOLUSDT`), etiqueta **Cripto** o **TradFi**
  según `contract_type`, los usados primero, flechas + Enter + Escape y táctil.
  Por defecto, el último usado (`localStorage` con try/catch).
- **Precio actual** con su antigüedad ("hace 20 s"). Sin precio → aviso y la
  dirección queda a elección manual.
- **Nivel** con `step = tick_size` y el % de distancia al escribir.
- **Dirección** deducida (`nivel > precio` → `above`) e invertible.
- **Aviso previo**: 3% por defecto y opción "sin aviso" (`near_pct: null`).
- **Es una invalidación**: el texto de ayuda muestra la hora local del cierre de
  las 00:00 UTC calculada con `Date`, no fija ("19:00" solo vale en UTC−5).
- **Fecha límite** (opcional) y fecha del recordatorio con
  `common/DateTimeInput.jsx`. Ojo: entrega `YYYY-MM-DDTHH:mm` sin zona, así que
  hay que enviar `new Date(valor).toISOString()`. En la pestaña Fecha, 08:00
  locales por defecto.
- **Avisos** de §5.1: nivel ya cruzado, precio ya dentro del aviso previo y
  símbolo TradFi.
- **Lista** de las alertas y recordatorios del bloque (o de la nota) con editar
  y borrar, a partir de `block.price_alerts` / `block.date_reminders`.
- Errores del servidor visibles en el modal (p. ej. "Símbolo no disponible en
  Binance Futures").

### 3. Toggle y menú táctil
- `components/notes/BlockReminderToggle.jsx` (`BellRing` de `lucide-react`)
  dentro del grupo `{noteActions && (…)}` de `NoteBlockList.jsx` (`:173`), junto
  a `BlockFollowUpToggle` y `BlockRevisitToggle`. Activo si el bloque tiene
  alertas activas o recordatorios pendientes.
- Entrada "Recordatorio" en `BlockTouchMenu.jsx`, también bajo `noteActions`.
- Con `noteActions = false` (lo pasa `components/todo/TodoItem.jsx`) no aparece
  en los pendientes, coherente con la restricción de anclaje de la task 020.
- `NoteBlockList.jsx` y `BlockTouchMenu.jsx` tienen cambios sin commitear de la
  feature de pendientes: integrar encima sin pisarlos.

## Fuera de alcance
Chips y recordatorios a nivel nota (task 024).

## Criterios de aceptación
- Crear una alerta y un recordatorio desde un bloque en desktop y en modo
  táctil (DevTools): el toggle queda activo y los dos aparecen en la lista del
  modal.
- `xau` encuentra `XAUUSDT` con la etiqueta TradFi y su aviso.
- Con el modal abierto 5 min, ninguna petición del navegador va a dominios de
  Binance (pestaña Network) y el precio se pide a nuestra API como mucho cada
  30 s.
- Sin precio disponible se puede crear eligiendo la dirección a mano.
- A 375 px de ancho el modal ocupa toda la pantalla y se usa sin zoom.
- Con `localStorage` bloqueado (ventana privada), el modal funciona.
- `npm run lint` y `npm run build` limpios.
