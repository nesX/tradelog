# Trading Journal (tradelog)

Aplicación web para registrar, analizar y revisar trades. Pensada para uso personal y preparándose para publicación.

**Stack**: Node 18+/Express + PostgreSQL + React 18/Vite + Tailwind. Auth con Google OAuth + JWT. Despliegue Docker Compose detrás de nginx.

**Estado**: en uso en `https://tradelog.nesx.co`. Documentación completa reorganizada en [`docs/`](docs/INDEX.md).

---

## Quickstart (Docker)

Requisitos: Docker + Docker Compose, una cuenta Google con Client ID OAuth configurado.

```bash
# 1. Variables (copiar plantilla y completar JWT_SECRET, DB creds, GOOGLE_CLIENT_ID, SUPER_ADMIN_EMAIL)
cd trading-journal/backend
cp .env.example .env
$EDITOR .env

# 2. Levantar todo (DB + backend + frontend en watch mode)
cd ..
sudo docker compose --env-file backend/.env up -d --build

# 3. Verificar
curl http://localhost:3000/api/health
# → { "success": true, "data": { "status": "ok", ... } }

# 4. Frontend disponible en http://localhost:5173
```

Setup manual sin Docker, login con Google, primer trade y troubleshooting en [`docs/getting-started.md`](docs/getting-started.md).

---

## Documentación

| Tema | Documento |
|------|-----------|
| Índice maestro de docs | [`docs/INDEX.md`](docs/INDEX.md) |
| Instalación paso a paso | [`docs/getting-started.md`](docs/getting-started.md) |
| Arquitectura del sistema | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Referencia de API REST | [`docs/api/reference.md`](docs/api/reference.md) |
| Despliegue en VPS | [`docs/operations/deployment.md`](docs/operations/deployment.md) |
| **Análisis de escalado** (low-budget) | [`docs/analysis/scaling.md`](docs/analysis/scaling.md) |
| **Análisis offline-first / cliente** | [`docs/analysis/offline-strategy.md`](docs/analysis/offline-strategy.md) |
| **Auditoría de seguridad** | [`docs/analysis/security.md`](docs/analysis/security.md) |
| Roadmap y backlog priorizado | [`docs/roadmap.md`](docs/roadmap.md) |
| Decisiones arquitectónicas pendientes | [`docs/pending-decisions.md`](docs/pending-decisions.md) |
| Specs de features (backlog detallado) | [`docs/features/`](docs/features/README.md) |

---

## Estructura del repo

```
tradelog/
├── README.md                    ← estás aquí
├── CLAUDE.md                    ← guía para Claude Code
├── docs/                        ← TODA la documentación
│   ├── INDEX.md
│   ├── getting-started.md
│   ├── architecture/
│   ├── api/
│   ├── development/
│   ├── operations/
│   ├── analysis/
│   ├── features/
│   ├── roadmap.md
│   └── pending-decisions.md
├── trading-journal/             ← código de la app
│   ├── backend/                 ← Express + Postgres
│   ├── frontend/                ← React + Vite
│   ├── database/                ← migraciones SQL
│   ├── docker-compose.yml       ← dev
│   ├── docker-compose.prod.yml  ← producción
│   └── .env.prod.example
└── .github/workflows/deploy.yml ← CI/CD a VPS
```
