# Task: frontend — chips de recordatorios y recordatorios a nivel nota
2026-11-22 · Frontend · Recordatorios de análisis 9/11 · Depende de: 023

Spec: §5.1 (Chips y nivel nota) de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Ver en el propio análisis qué está armado, a qué distancia está el precio y qué
ya se disparó, sin abrir nada, y poder anclar recordatorios a la nota entera.

## Alcance

### 1. `components/notes/ReminderChip.jsx`
| Estado | Chip |
|---|---|
| Alerta activa | `🔔 BTCUSDT ↓ 60,000 · −35%` |
| Invalidación activa | `⛔ BTCUSDT ↑ 110,000 · cierre diario · +19%` |
| Alerta disparada | ámbar: `⚡ tocado 02/03/2027` |
| Invalidación disparada | `⛔ invalidada 04/03/2027` |
| Recordatorio por fecha pendiente | `📅 01/03/2027` |

- La distancia sale del `last_price` que trae cada alerta en el `GET` de la nota
  (task 020): se actualiza al refrescar la nota tras un tick, no en vivo.
- Los recordatorios ya enviados no llevan chip: su tarjeta está en la bandeja.
- Clic en el chip → `ReminderModal` en modo edición.
- Números y fechas con `utils/formatters.js` (`formatNumber`, `formatDate`).
- Debajo del contenido del bloque, en una fila compacta que no desplace los
  controles flotantes del bloque.

### 2. Nivel nota — `pages/NoteEditor.jsx`
- El mismo botón junto al título; abre el modal con `note_id`.
- Chips bajo el título con `note.price_alerts` y `note.date_reminders`.

### 3. Re-anclaje visible
Borrar un bloque con alertas las pasa a la nota (trigger de la migración 028).
`useDeleteBlock` ya invalida `noteKeys.detail(noteId)`
(`hooks/useNotes.js:139-155`), así que tras el borrado deberían aparecer bajo el
título sin código extra: comprobarlo.

## Criterios de aceptación
- Los cinco estados del chip se ven bien en tema claro y oscuro, y en modo
  táctil.
- Borrar un bloque con una alerta → su chip reaparece bajo el título de la
  nota.
- Mover un bloque a otra nota → sus chips viajan con él.
- `npm run lint` y `npm run build` limpios.
