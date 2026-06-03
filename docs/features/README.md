# Specs de features

Esta carpeta contiene las especificaciones detalladas de cada feature mayor del proyecto. Algunas ya están implementadas (los commits lo demuestran), otras siguen siendo backlog.

> **Importante**: estas specs se escribieron antes de implementar, así que pueden contener decisiones que cambiaron durante el desarrollo. Para entender el estado actual del código, leer [`../architecture/overview.md`](../architecture/overview.md) y los archivos del repo.

## Índice

| Spec | Tamaño | Estado | Notas |
|------|--------|--------|-------|
| [`sistema-de-notas.md`](specs/sistema-de-notas.md) | 52 KB | ✅ Implementado | Editor de notas con bloques tipados, jerarquía, tags, FTS. Base de buena parte del valor de la app. |
| [`implementacion-drag-and-drop-para-notas.md`](specs/implementacion-drag-and-drop-para-notas.md) | 34 KB | ✅ Implementado | `@dnd-kit` + `fractional-indexing`, optimistic updates en `treeManipulation.js`. |
| [`progreso-draganddrop.md`](specs/progreso-draganddrop.md) | 4 KB | 📝 Tracking | Notas de progreso histórico del DnD. No es feature. |
| [`implementacion-sistema-de-referencias.md`](specs/implementacion-sistema-de-referencias.md) | 18 KB | ✅ Implementado | Referencias trade↔nota (bidireccionales). Migración 022. |
| [`referencias-de-trades-en-notas.md`](specs/referencias-de-trades-en-notas.md) | 20 KB | ✅ Implementado | Bloque `trade-reference` con galería horizontal. Migración 023. |
| [`seguimiento-de-bloques-en-not.md`](specs/seguimiento-de-bloques-en-not.md) | 16 KB | ✅ Implementado | `follow_up_required` / `follow_up_done` en `note_blocks`. Migración 019. Page Review. |
| [`update-notas-bloque-callout.md`](specs/update-notas-bloque-callout.md) | 7 KB | ✅ Implementado | Bloque tipo callout con variantes. Migración 014. |
| [`section-dividers-en-sidebar-de-notas.md`](specs/section-dividers-en-sidebar-de-notas.md) | 20 KB | ✅ Implementado | `is_section_divider` en notas. Migración 020. |
| [`buscador-full-texto-notas.md`](specs/buscador-full-texto-notas.md) | 17 KB | ✅ Implementado | `tsvector` + `/api/notes/search`. Migración 015. |
| [`filtros-temporales-en-seccion-revision.md`](specs/filtros-temporales-en-seccion-revision.md) | 9 KB | ✅ Implementado | Filtros de fecha en page Review. Commit `4d346b0`. |
| [`compresion-de-imagenes.md`](specs/compresion-de-imagenes.md) | 9 KB | ✅ Implementado | `utils/imageCompression.js`: webp, 1920px, 85% quality. |
| [`sistema-de-backtesting-rapido.md`](specs/sistema-de-backtesting-rapido.md) | 20 KB | ✅ Implementado | Sesiones + trades virtuales. Migraciones 010-012, 016. |
| [`backtesting-rapido-detalle.md`](specs/backtesting-rapido-detalle.md) | 20 KB | ✅ Implementado | Detalle de implementación del backtesting (originalmente `tasks.md` raíz). |
| [`sistema-de-gestion-de-usuarios.md`](specs/sistema-de-gestion-de-usuarios.md) | 37 KB | 🟡 Parcial | Super_admin + admin existen + page admin/Users. Spec describe invitaciones, RBAC más fino, no implementados. |
| [`sistema-de-estrategias.md`](specs/sistema-de-estrategias.md) | 27 KB | 🟡 Parcial | Tablas `systems`, `signals`, `timeframes` existen. Spec describe templates y paneles más elaborados que aún no están. |

## Cómo se infirió el estado

- ✅ Implementado: hay código + migraciones + commits relacionados.
- 🟡 Parcial: hay piezas pero la spec describe más de lo presente.
- ❌ No implementado: no hay correspondencia en el código.
- 📝 Tracking: es un doc de tracking, no una spec.

Para confirmar el estado de cualquier feature, mirar:
- Tablas en `trading-journal/database/*.sql`.
- Rutas en `trading-journal/backend/src/routes/*`.
- Componentes en `trading-journal/frontend/src/components/<dominio>/`.
- Páginas en `trading-journal/frontend/src/pages/`.

## Cómo añadir una nueva spec

1. Crear archivo `specs/<nombre-en-kebab-case>.md`.
2. Estructura sugerida:
   - **Motivación**: por qué existe esta feature.
   - **Casos de uso**: 3-5 ejemplos concretos.
   - **Modelo de datos**: tablas/columnas nuevas o cambios.
   - **API**: endpoints nuevos o modificados.
   - **UI**: pantallas y componentes.
   - **Plan de implementación**: orden de pasos.
3. Agregar entrada en la tabla de este README.
4. Cross-link desde [`../roadmap.md`](../roadmap.md).

## Specs pendientes (no inventadas todavía)

Áreas con valor potencial pero sin spec aún:

- Gráficos en Stats (Chart.js / Recharts).
- Calendar heatmap de trades.
- Export PDF de informes.
- Integraciones con exchanges (Binance API, etc.) — mencionado en el brief original como Fase 5.
- Sync automático de trades desde un broker.

Si decidís implementar alguna, primero escribí la spec aquí, después codeá.
