# Task: frontend — página `/recordatorios`, tarjetas y campana
2026-11-22 · Frontend · Recordatorios de análisis 10/11 · Depende de: 021, 023

Spec: §5.2 de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Un espacio de trabajo propio donde las tarjetas esperan hasta que el usuario
actúa y desde donde se administra todo lo armado.

## Alcance

### 1. Ruta y header
- `pages/Reminders.jsx` en `/recordatorios`, registrada en `App.jsx` con el
  mismo patrón protegido que `/todo`.
- `components/layout/Header.jsx`: añadir `/recordatorios` a `isNotesArea`
  (`:23`) y una campana con badge (`useNotificationCount`) visible en toda el
  área de notas, sin badge cuando hay 0. El archivo tiene cambios sin commitear
  de la feature de pendientes.

### 2. Pestañas
- **Pendientes**: tarjetas abiertas, las más recientes primero.
- **Programadas**: alertas activas ordenadas por `|distance_pct|` y
  recordatorios pendientes por fecha; filtro por símbolo; editar (modal), borrar
  (`ConfirmDialog`) e ir al análisis.
- **Historial**: tarjetas resueltas con "Cargar más" (cursor `before`). Las de
  disparo muestran cuánto tardaron (`triggered_at − armed_at`).

### 3. `components/notifications/NotificationCard.jsx`
Una variante por `type`, con los colores y acciones de la tabla de §5.2:
- **Ver análisis** → `/notes/:noteId?highlight=:blockId` (`NoteEditor.jsx:64-85`
  ya hace el scroll y el resaltado); sin `highlight` en alertas de nota. No
  cierra la tarjeta.
- **Archivar / Entendido / Mantener sin fecha** → `resolve` con `dismissed`.
- **Borrar las demás alertas** → `resolve` con `delete_sibling_alerts: true`;
  solo si `payload.sibling_alerts` no está vacío.
- **Re-armar / Ajustar nivel / Extender fecha / Re-programar** →
  `ReminderModal` precargado; al guardar, el backend resuelve la tarjeta.
- **Borrar alerta** → `DELETE /api/price-alerts/:id`.
- Si la alerta, el recordatorio o la nota ya no existen (campos de
  disponibilidad de la task 021), se ocultan las acciones que los necesitan y
  la tarjeta se muestra solo con el payload.
- La cercanía de una invalidación explica que falta el cierre: "BTCUSDT llegó a
  110,400 · invalidación en 110,000: salta solo si cierra el día por encima".
- Horas en hora local: "tocó 60,000 · 05:00–06:00".

## Criterios de aceptación
- Una tarjeta no desaparece sin acción: recargar, cambiar de pestaña o ir al
  análisis y volver la mantienen en Pendientes.
- El badge se actualiza al volver a la pestaña del navegador y cada 5 min, y
  baja en el acto al archivar.
- Re-armar desde una tarjeta `price_alert_hit` → la tarjeta pasa al Historial
  como `rearmed` y la alerta aparece en Programadas.
- Las seis variantes de tarjeta se ven bien a 375 px y en modo táctil.
- `npm run lint` y `npm run build` limpios.

## Verificación
Para ver las seis variantes sin esperar a eventos reales, insertar en dev una
tarjeta de cada tipo a mano (`INSERT INTO notifications …`) con payloads como
el de §3.6.
