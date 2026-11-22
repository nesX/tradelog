# Task: API de la bandeja (tarjetas)
2026-11-22 · Backend · Recordatorios de análisis 6/11 · Depende de: 019, 020

Spec: §3.6 y §3.7 (Tarjetas) de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Listar, contar y cerrar las tarjetas que crean el job y el sync. Una tarjeta
solo se cierra por una acción del usuario.

## Alcance
`notification.validator.js`, `.service.js`, `.controller.js` y `.routes.js` en
`/api/notifications`. El repository ya existe desde la task 019.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/notifications?status=open\|resolved&before=<id>` | Abiertas: todas, las más recientes primero. Resueltas: 50 por página. |
| `GET` | `/api/notifications/count` | `{ open }` para el badge |
| `POST` | `/api/notifications/:id/resolve` | `{ resolution: 'dismissed', delete_sibling_alerts?: boolean }` |

- **Cursor del historial**: se ordena por `resolved_at DESC` (índice
  `idx_notifications_resolved`), pero el cursor es un `id`. El servidor busca el
  `resolved_at` de ese `id` y pagina por `(resolved_at, id) < (…, …)`; paginar
  solo por `id` mezclaría el orden, porque las tarjetas no se archivan en el
  orden en que se crearon.
- **Disponibilidad**: cada tarjeta lleva lo que la UI necesita para ocultar
  acciones (§5.2): el estado actual de la alerta o del recordatorio (`null` si
  se borró, porque la FK pasa a `NULL`) y `note_available` (la nota existe y no
  está en la papelera), con `LEFT JOIN`.
- **`resolve`**: solo tarjetas del usuario (si no, 404). Si ya estaba resuelta,
  se devuelve tal cual: un doble clic no debe dar error.
- **`delete_sibling_alerts`**: solo en `price_alert_invalidation` (si no,
  `ValidationError`). En la misma transacción borra las demás alertas
  **activas** del mismo anclaje y resuelve sus tarjetas abiertas como
  `dismissed`. El anclaje es el actual de la alerta (puede haber pasado del
  bloque a la nota por el trigger de la migración 028); si la alerta ya no
  existe, el del payload. Los recordatorios por fecha no se tocan.

## Criterios de aceptación
- La paginación del historial no repite ni salta tarjetas aunque se archiven en
  otro orden que el de creación.
- `delete_sibling_alerts` sobre una tarjeta que no es de invalidación → 400.
- `resolve` sobre una tarjeta de otro usuario → 404.
- `npm test` (service con repos mockeados) y `npm run lint` pasan.
