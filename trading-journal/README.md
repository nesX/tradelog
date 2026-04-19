# Trading Journal

Aplicación web profesional para registro y análisis de trades de trading.

## Stack Tecnológico

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Express.js
- **Base de datos**: PostgreSQL
- **Estado**: TanStack Query (React Query)
- **Validación**: Joi (backend) + React Hook Form (frontend)

## Requisitos Previos

- Node.js 18+
- PostgreSQL 14+
- npm o yarn

## Instalación

### 1. Clonar y configurar

```bash
cd trading-journal
```

### 2. Configurar Base de Datos

```bash
# Crear la base de datos
createdb trading_journal

# Ejecutar scripts de inicialización
psql -d trading_journal -f database/schema.sql
psql -d trading_journal -f database/indexes.sql
psql -d trading_journal -f database/triggers.sql
psql -d trading_journal -f database/views.sql

# (Opcional) Cargar datos de prueba
psql -d trading_journal -f database/seed.sql
```

### 3. Configurar Backend

```bash
cd backend

# Instalar dependencias
npm install

# Crear archivo de configuración
cp .env.example .env

# Editar .env con tus credenciales de PostgreSQL
```

Contenido de `.env`:
```
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trading_journal
DB_USER=tu_usuario
DB_PASSWORD=tu_password
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880
ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=info
```

### 4. Configurar Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Crear archivo de configuración (opcional)
cp .env.example .env
```

## Ejecución

### Desarrollo

Ejecutar backend y frontend en terminales separadas:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

La aplicación estará disponible en:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000/api

### Producción

```bash
# Backend
cd backend
npm start

# Frontend
cd frontend
npm run build
npm run preview
```

## Estructura del Proyecto

```
trading-journal/
├── backend/
│   └── src/
│       ├── config/         # Configuración (DB, env)
│       ├── controllers/    # Controladores de rutas
│       ├── middleware/     # Middlewares (errores, validación, upload)
│       ├── models/         # Constantes y tipos del modelo
│       ├── repositories/   # Capa de acceso a datos
│       ├── routes/         # Definición de rutas
│       ├── services/       # Lógica de negocio
│       ├── utils/          # Utilidades
│       ├── validators/     # Schemas de validación Joi
│       └── server.js       # Punto de entrada
├── frontend/
│   └── src/
│       ├── api/            # Cliente HTTP y endpoints
│       ├── components/     # Componentes React
│       ├── constants/      # Constantes
│       ├── hooks/          # Custom hooks (React Query)
│       ├── pages/          # Páginas
│       ├── styles/         # Estilos globales
│       └── utils/          # Utilidades
└── database/
    ├── schema.sql          # DDL de tablas
    ├── indexes.sql         # Índices
    ├── triggers.sql        # Triggers
    ├── views.sql           # Vistas
    └── seed.sql            # Datos de prueba
```

## API Endpoints

### Trades

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/trades | Listar trades (paginado, filtros) |
| GET | /api/trades/:id | Obtener trade por ID |
| POST | /api/trades | Crear trade |
| PUT | /api/trades/:id | Actualizar trade |
| DELETE | /api/trades/:id | Eliminar trade |
| GET | /api/trades/symbols | Obtener símbolos únicos |
| POST | /api/trades/import/preview | Preview de CSV |
| POST | /api/trades/import | Importar desde CSV |

### Estadísticas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/stats | Estadísticas generales |
| GET | /api/stats/by-symbol | Estadísticas por símbolo |
| GET | /api/stats/by-date | Estadísticas por rango de fechas |
| GET | /api/stats/by-type | Estadísticas por tipo (LONG/SHORT) |
| GET | /api/stats/daily-pnl | P&L diario |
| GET | /api/stats/top-trades | Mejores y peores trades |

## Formato CSV para Importación

```
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade
```

- **Separador**: punto y coma (;)
- **Fecha**: formato ISO o "YYYY-MM-DD HH:mm"
- **Tipo**: LONG o SHORT
- **Precio salida**: dejar vacío para trades abiertos
- **Notas**: opcional

## Funcionalidades

- CRUD completo de trades
- Importación masiva desde CSV
- Upload de imágenes con drag & drop
- Filtros y ordenamiento
- Estadísticas en tiempo real
- Responsive design
- Notificaciones toast
- Paginación

## Licencia

MIT
