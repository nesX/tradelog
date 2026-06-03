# Roadmap

Vista unificada del backlog: TODOs conocidos, propuestas técnicas de los documentos de análisis, y specs de features pendientes de implementar.

> Esta es una **vista organizativa**. Las decisiones que activan o desactivan partes del roadmap están en [`pending-decisions.md`](pending-decisions.md). Mantener este documento al día tras cada sprint.

---

## Carriles

El backlog se organiza en tres carriles paralelos:

- 🛡 **Pre-publicación** — bloqueante antes de aceptar usuarios externos.
- 🚀 **Post-publicación** — útil tras lanzamiento, antes de crecer.
- ✨ **Mejoras** — features nuevas y optimizaciones que no son urgentes.

---

## 🛡 Pre-publicación (bloqueantes)

Originados en [`analysis/scaling.md` Fase 0](analysis/scaling.md#fase-0--hardening-pre-publicación) y [`analysis/security.md`](analysis/security.md).

| # | Item | Origen | Esfuerzo | Bloqueado por |
|---|------|--------|----------|---------------|
| 1 | Rate limiting con `express-rate-limit` | security gap 1 | 1d | — |
| 2 | Rotación de logs (winston-daily-rotate o logrotate) | security gap 2 | 0.5d | — |
| 3 | Validación de imágenes con magic bytes (`file-type`) | security gap 3 | 1d | — |
| 4 | Corregir mensaje "1MB" → leer de config | security gap 4 | trivial | — |
| 5 | CSP estricta en Helmet | security gap 10 | 1d | — |
| 6 | Healthcheck con `SELECT 1` a la DB | monitoring | trivial | — |
| 7 | Script de promoción de admin de emergencia | security gap 9 | 0.5d | — |
| 8 | Strict-Transport-Security (HSTS) en nginx prod | scaling F0 | trivial | — |
| 9 | Documentar rotación de `JWT_SECRET` (operativa) | scaling F0 | 0.5d | hecho parcial en docs/operations/env-vars |
| 10 | Backups automatizados de la DB (cron + B2) | scaling | 1-2d | D-014 (¿implementar ahora?) |

**Suma**: ~1 semana de trabajo concentrado.

---

## 🚀 Post-publicación (importantes)

| # | Item | Origen | Esfuerzo | Decisión |
|---|------|--------|----------|----------|
| 11 | Caching LRU in-process para stats | scaling F1 | 2-3d | — |
| 12 | `Cache-Control: immutable` + ETags para `/api/images` | scaling F1 | 0.5d | — |
| 13 | `compression` middleware (gzip) | scaling F1 | trivial | — |
| 14 | Índices compuestos `(user_id, ...)` | scaling F2 | 1d | — |
| 15 | Paginación cursor-based en `/api/trades` | scaling F2 | 2-3d | — |
| 16 | Cache persistente con TanStack (IndexedDB) | offline Capa 1 | 1-2d | — |
| 17 | PWA shell con `vite-plugin-pwa` | offline Capa 2 | 2-3d | — |
| 18 | CSV preview 100% client-side | offline Capa 3 + UX | 1d | — |
| 19 | Stats por símbolo refresca cuando se crea/edita trade | CLAUDE.md TODO | 1d | — |
| 20 | Edit column sticky/pinned en pantalla pequeña | CLAUDE.md TODO | 1d | — |
| 21 | Imágenes con cleanup de huérfanos (script cron) | scaling F4 | 1d | — |
| 22 | Thumbnails generados con `sharp` al subir | scaling F3 | 2d | D-005 |
| 23 | JWT revocation list (Postgres) | security gap 6 | 2-3d | D-006 |

---

## ✨ Mejoras (no urgentes)

### Features (specs en `features/specs/`, algunas implementadas)

| Feature | Spec | Estado inferido |
|---------|------|-----------------|
| Sistema de Notas | `sistema-de-notas.md` | ✅ Implementado (commits + código) |
| Drag & Drop notas | `implementacion-drag-and-drop-para-notas.md` | ✅ Implementado |
| Sistema de Referencias | `implementacion-sistema-de-referencias.md` | ✅ Implementado (commit `cd7f786` y posteriores) |
| Bloque `trade_reference` | `referencias-de-trades-en-notas.md` | ✅ Implementado (commit `cd7f786`) |
| Filtros temporales en revisión | `filtros-temporales-en-seccion-revision.md` | ✅ Implementado (commit `4d346b0`) |
| Compresión de imágenes | `compresion-de-imagenes.md` | ✅ Implementado (`utils/imageCompression.js`) |
| Seguimiento de bloques (follow-up) | `seguimiento-de-bloques-en-not.md` | ✅ Implementado (migración 019, hook `useBlockFollowUp`) |
| Bloque callout | `update-notas-bloque-callout.md` | ✅ Implementado (migración 014) |
| Backtesting rápido | `sistema-de-backtesting-rapido.md` + `backtesting-rapido-detalle.md` | ✅ Implementado (rutas, controllers, UI completos) |
| Gestión de usuarios | `sistema-de-gestion-de-usuarios.md` | 🟡 Parcial — super_admin existe, listing en admin/Users, pero spec habla de invitaciones / RBAC más fino |
| Búsqueda full-text de notas | `buscador-full-texto-notas.md` | ✅ Implementado (`/api/notes/search`, migración 015) |
| Section dividers en sidebar | `section-dividers-en-sidebar-de-notas.md` | ✅ Implementado (migración 020) |
| Sistema de estrategias | `sistema-de-estrategias.md` | 🟡 Parcial — `systems` y `signals` existen pero spec describe algo más amplio (templates, paneles dedicados) |
| Progreso DnD | `progreso-draganddrop.md` | 📝 Doc de tracking del DnD (no es feature) |

### Mejoras de UX / DX

- Code splitting / lazy routes en React (`React.lazy` + `<Suspense>`).
- Gráficos en Stats page (Chart.js o Recharts) — hoy son solo cards numéricas.
- Calendar view de trades (heatmap por día).
- Export de stats a CSV/PDF.
- Tags / categorías propias por trade (no solo system/signals).

### Infraestructura

- CI con lint + tests bloqueando merges (no solo deploy).
- Pre-commit hook (husky + lint-staged).
- Snapshot tests del frontend con Vitest + Testing Library.
- Integration tests del backend con DB transaccional.
- Sentry o similar para captura de errores del navegador.

---

## TODOs históricos (heredados de CLAUDE.md)

Estos estaban en `CLAUDE.md` como "Known TODOs":

- [x] Fix edit column visibility at low screen resolutions (sticky/pinned) → **item #20** arriba.
- [x] Stats page should refresh when a new trade is created → **item #19** arriba.

---

## Cómo usar este roadmap

1. **Para priorizar trabajo del próximo sprint**: tomar de Pre-publicación primero. Items con menor `Esfuerzo` y sin "Bloqueado por" son los primeros.
2. **Para evaluar nuevas features**: mirar si la spec ya existe en `features/specs/`. Si no, considerar agregarla allí antes de codear.
3. **Para enunciar trade-offs**: cruzar con `pending-decisions.md` — algunos items dependen de decisiones del dueño.

---

## Última actualización

Generado al reorganizar la documentación (mayo 2026). Re-actualizar tras cada feature completada o decisión tomada.
