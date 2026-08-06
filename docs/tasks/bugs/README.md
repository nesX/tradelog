# Bugs de notas — índice

Hallazgos de la revisión del feature de notas (2026-08-05). Los 11 tasks fueron
implementados el mismo día y sus archivos viven ahora en [`../done/`](../done/).

Estado: **todos resueltos y verificados en código** (build de frontend limpio,
`node --check` en backend). Pendiente de confirmar contra entorno vivo:

- `EXPLAIN ANALYZE` de la búsqueda FTS reescrita (debería mostrar Bitmap Index
  Scan sobre los GIN de la migración 015).
- Una pasada real del job de purga (`NOTE_PURGE_DAYS` / `NOTE_PURGE_INTERVAL_HOURS`).

Follow-ups que quedaron abiertos (decisión consciente, no bugs):

- `/api/images` sigue sin autenticación (gap documentado en
  `docs/analysis/security.md`; requiere URLs firmadas para no romper `<img>`).
- Endpoint transaccional en backend para mover/convertir sub-notas
  (hoy el cliente encadena 3 requests con feedback de fallo parcial vía toast).

Esta carpeta queda para futuros bugs; al empezar uno moverlo a `../in-progress/`
y al terminar a `../done/`.
