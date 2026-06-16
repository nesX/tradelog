# Índice de documentación — Trading Journal

Bienvenido. Esta es la entrada navegable a toda la documentación del proyecto.
Si no sabés por dónde empezar: [`getting-started.md`](getting-started.md).

---

## 🚀 Empezar

- [`getting-started.md`](getting-started.md) — Setup local (Docker y manual), variables mínimas, primer trade.

## 🏗 Arquitectura

- [`architecture/overview.md`](architecture/overview.md) — Vista global del sistema, diagrama de capas y flujo de un request.
- [`architecture/backend.md`](architecture/backend.md) — Estructura del backend, capas, patrones, paths reales.
- [`architecture/frontend.md`](architecture/frontend.md) — React, TanStack Query, contexts, hooks, compresión de imágenes.
- [`architecture/database.md`](architecture/database.md) — Tablas, FKs, columnas generadas, migraciones.
- [`architecture/auth.md`](architecture/auth.md) — Google OAuth, JWT lifecycle, roles, super_admin bootstrap.

## 🔌 API

- [`api/reference.md`](api/reference.md) — Todos los endpoints REST con req/res y errores.
- [`api/csv-format.md`](api/csv-format.md) — Spec del importador CSV.

## 🛠 Desarrollo

- [`development/workflow.md`](development/workflow.md) — Branching, commits, ciclo de cambio.
- [`development/testing.md`](development/testing.md) — Jest, qué cubrir, ausencia de tests frontend.
- [`development/coding-standards.md`](development/coding-standards.md) — ESLint, Prettier, convenciones.
- [`development/design-system.md`](development/design-system.md) — Paleta, componentes, layout, dark mode.
- [`development/style-guide.md`](development/style-guide.md) — Guía de estilos frontend implementacional.

## 🚢 Operaciones

- [`operations/deployment.md`](operations/deployment.md) — Despliegue completo a VPS (`tradelog.nesx.co`).
- [`operations/docker.md`](operations/docker.md) — Comandos comunes de Docker Compose.
- [`operations/ci-cd.md`](operations/ci-cd.md) — Workflow de GitHub Actions con detect-changes.
- [`operations/env-vars.md`](operations/env-vars.md) — Referencia exhaustiva de todas las variables.
- [`operations/database-ops.md`](operations/database-ops.md) — Backups, restore, migraciones, exec psql.
- [`operations/monitoring.md`](operations/monitoring.md) — Logs Winston, health check, qué vigilar.
- [`operations/troubleshooting.md`](operations/troubleshooting.md) — Errores comunes y soluciones.

## 🔍 Análisis (preparación para publicar)

- [`analysis/scaling.md`](analysis/scaling.md) — **Escalado low-budget** con fases.
- [`analysis/offline-strategy.md`](analysis/offline-strategy.md) — **Offline-first** y compute en cliente.
- [`analysis/security.md`](analysis/security.md) — Auditoría de seguridad y gaps.
- [`analysis/notes-known-issues.md`](analysis/notes-known-issues.md) — Issues conocidos y deuda técnica del sistema de Notas.

## 🗺 Roadmap y decisiones

- [`roadmap.md`](roadmap.md) — TODOs unificados y backlog priorizado.
- [`pending-decisions.md`](pending-decisions.md) — **Preguntas arquitectónicas abiertas** que el dueño debe responder.

## 📋 Specs de features

- [`features/README.md`](features/README.md) — Índice de las 15 especificaciones detalladas (algunas ya implementadas).

---

## Cómo está organizada esta documentación

- **`getting-started`** — el primer click cuando llegás.
- **`architecture/`** — explica *cómo funciona* la app.
- **`api/`** — referencia rápida cuando consumís endpoints.
- **`operations/`** — todo lo que necesitás para *operar* la app en producción.
- **`development/`** — convenciones y herramientas para *contribuir*.
- **`analysis/`** — documentos de análisis estratégico (escalado, offline, seguridad). Más extensos.
- **`features/specs/`** — backlog histórico de specs (algunas implementadas, otras pendientes).
- **`roadmap.md` y `pending-decisions.md`** — vista de qué viene y qué decisiones falta tomar.

Si encontrás algo desactualizado o un link roto, abrí un issue o corregilo: la documentación es código.
