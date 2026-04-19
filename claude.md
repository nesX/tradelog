Necesito crear una aplicación web profesional de registro de trades con arquitectura escalable en JavaScript puro (sin TypeScript).

STACK TECNOLÓGICO:
- Frontend: React 18 + Vite (JavaScript)
- Backend: Express.js (JavaScript)
- Base de datos: PostgreSQL
- Validación: Joi (backend) + React Hook Form (frontend)
- Estado: React Query (TanStack Query)
- Estilos: Tailwind CSS
- Manejo de errores centralizado

ARQUITECTURA DEL PROYECTO:

/trading-journal
│
├── /backend
│   ├── /src
│   │   ├── /config
│   │   │   ├── database.js          # Configuración de conexión a PostgreSQL (pg pool)
│   │   │   └── env.js               # Variables de entorno validadas
│   │   │
│   │   ├── /middleware
│   │   │   ├── errorHandler.js      # Manejo centralizado de errores
│   │   │   ├── validation.js        # Middleware de validación con Joi
│   │   │   └── upload.js            # Configuración de multer para imágenes
│   │   │
│   │   ├── /models
│   │   │   └── trade.model.js       # Constantes y schemas del modelo Trade
│   │   │
│   │   ├── /repositories
│   │   │   └── trade.repository.js  # Capa de acceso a datos (queries SQL)
│   │   │
│   │   ├── /services
│   │   │   ├── trade.service.js     # Lógica de negocio
│   │   │   ├── csvParser.service.js # Parseo y validación de CSV
│   │   │   └── stats.service.js     # Cálculos de estadísticas
│   │   │
│   │   ├── /controllers
│   │   │   ├── trade.controller.js  # Controladores de endpoints
│   │   │   └── stats.controller.js
│   │   │
│   │   ├── /routes
│   │   │   ├── trade.routes.js      # Rutas de trades
│   │   │   └── stats.routes.js      # Rutas de estadísticas
│   │   │
│   │   ├── /validators
│   │   │   └── trade.validator.js   # Schemas de validación Joi
│   │   │
│   │   ├── /utils
│   │   │   ├── logger.js            # Winston para logs
│   │   │   ├── response.js          # Respuestas HTTP estandarizadas
│   │   │   └── fileUtils.js         # Utilidades para manejo de archivos
│   │   │
│   │   └── server.js                # Punto de entrada
│   │
│   ├── /uploads                     # Almacenamiento de imágenes
│   ├── /tests                       # Tests con Jest
│   ├── .env.example
│   ├── .eslintrc.json
│   ├── .prettierrc
│   └── package.json
│
├── /frontend
│   ├── /src
│   │   ├── /api
│   │   │   ├── client.js            # Axios configurado
│   │   │   └── endpoints.js         # Definición de endpoints
│   │   │
│   │   ├── /components
│   │   │   ├── /common              # Componentes reutilizables
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Input.jsx
│   │   │   │   └── ImageViewer.jsx
│   │   │   │
│   │   │   ├── /layout
│   │   │   │   ├── Header.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   └── Layout.jsx
│   │   │   │
│   │   │   └── /trades
│   │   │       ├── TradeTable.jsx
│   │   │       ├── TradeRow.jsx
│   │   │       ├── CreateTradeForm.jsx
│   │   │       ├── CSVImport.jsx
│   │   │       └── TradeStats.jsx
│   │   │
│   │   ├── /hooks
│   │   │   ├── useTrades.js         # React Query hooks
│   │   │   ├── useStats.js
│   │   │   └── useImageUpload.js
│   │   │
│   │   ├── /pages
│   │   │   ├── Home.jsx             # Historial de trades
│   │   │   ├── CreateTrade.jsx      # Crear trade
│   │   │   └── Stats.jsx            # Dashboard de estadísticas
│   │   │
│   │   ├── /utils
│   │   │   ├── csvParser.js         # Cliente para parsear CSV
│   │   │   ├── formatters.js        # Formateo de números, fechas, etc.
│   │   │   └── validators.js
│   │   │
│   │   ├── /constants
│   │   │   └── tradeConstants.js    # Constantes compartidas
│   │   │
│   │   ├── /styles
│   │   │   └── globals.css
│   │   │
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   ├── .env.example
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── .eslintrc.json
│   ├── .prettierrc
│   └── package.json
│
├── /database
│   ├── schema.sql                   # DDL completo
│   ├── indexes.sql                  # Índices optimizados
│   ├── triggers.sql                 # Triggers para updated_at
│   └── seed.sql                     # Datos de prueba (opcional)
│
└── README.md

MODELO DE DATOS (PostgreSQL):

1. Tabla: trades
   - id SERIAL PRIMARY KEY
   - symbol VARCHAR(20) NOT NULL
   - trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('LONG', 'SHORT'))
   - entry_price DECIMAL(18, 8) NOT NULL
   - exit_price DECIMAL(18, 8)
   - quantity DECIMAL(18, 8) NOT NULL
   - entry_date TIMESTAMP NOT NULL
   - exit_date TIMESTAMP
   - commission DECIMAL(18, 8) DEFAULT 0
   - pnl DECIMAL(18, 8) GENERATED ALWAYS AS (
       CASE 
         WHEN exit_price IS NOT NULL THEN
           CASE 
             WHEN trade_type = 'LONG' THEN (exit_price - entry_price) * quantity - commission
             WHEN trade_type = 'SHORT' THEN (entry_price - exit_price) * quantity - commission
           END
         ELSE NULL
       END
     ) STORED
   - pnl_percentage DECIMAL(10, 4) GENERATED ALWAYS AS (
       CASE 
         WHEN exit_price IS NOT NULL AND entry_price > 0 THEN
           CASE 
             WHEN trade_type = 'LONG' THEN ((exit_price - entry_price) / entry_price) * 100
             WHEN trade_type = 'SHORT' THEN ((entry_price - exit_price) / entry_price) * 100
           END
         ELSE NULL
       END
     ) STORED
   - image_url VARCHAR(500)
   - notes TEXT
   - status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED'))
   - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   - updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

2. Índices importantes:
   CREATE INDEX idx_trades_entry_date ON trades(entry_date DESC);
   CREATE INDEX idx_trades_symbol ON trades(symbol);
   CREATE INDEX idx_trades_status ON trades(status);
   CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

3. Trigger para updated_at automático:
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.updated_at = CURRENT_TIMESTAMP;
       RETURN NEW;
   END;
   $$ language 'plpgsql';

   CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

4. Vista para estadísticas rápidas (opcional):
   CREATE VIEW trade_stats AS
   SELECT 
     COUNT(*) as total_trades,
     COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0) as winning_trades,
     COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl < 0) as losing_trades,
     ROUND(SUM(pnl)::numeric, 2) as total_pnl,
     ROUND(AVG(pnl) FILTER (WHERE status = 'CLOSED')::numeric, 2) as avg_pnl,
     MAX(pnl) as best_trade,
     MIN(pnl) as worst_trade
   FROM trades;

FUNCIONALIDADES CORE:

1. CRUD de Trades:
   - Crear (formulario manual o CSV)
   - Listar con paginación, filtros y ordenamiento
   - Actualizar trade existente
   - Eliminar (soft delete recomendado)

2. Import CSV (PRIORIDAD):
   - Formato: fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
   - Ejemplo: 2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade
   - Validación robusta línea por línea
   - Mostrar errores específicos con número de línea
   - Preview de datos parseados antes de guardar
   - Permitir corregir errores sin perder el texto

3. Manejo de imágenes:
   - Upload con drag & drop
   - Validación: tipos (jpg, png, webp), tamaño máximo 5MB
   - Almacenamiento en /backend/uploads con nombres únicos (timestamp + uuid)
   - Endpoint para servir imágenes: GET /api/images/:filename
   - Thumbnail en tabla (max 100px)
   - Modal con imagen completa al hacer click

4. Estadísticas en Dashboard:
   - Total de trades (abiertos/cerrados)
   - Win rate (% de trades ganadores)
   - P&L total y promedio
   - Mejor y peor trade
   - Filtros por fecha, símbolo, tipo

PATRONES A IMPLEMENTAR:

1. Repository Pattern:
   - Toda interacción con BD en repositories
   - Queries SQL parametrizadas para prevenir SQL injection
   
2. Service Layer:
   - Lógica de negocio separada de controllers
   - Validaciones de negocio
   
3. Manejo de errores en capas:
   - try/catch en controllers
   - Errores custom (NotFoundError, ValidationError, etc.)
   - Middleware errorHandler que captura todo
   
4. Respuestas HTTP estandarizadas:
   - { success: true, data: {...} }
   - { success: false, error: {...} }
   
5. JSDoc para documentación:
   /**
    * @param {string} symbol - Símbolo del trade
    * @returns {Promise<Object>} Trade encontrado
    */

DEPENDENCIAS CLAVE:

Backend:
- express
- pg (node-postgres)
- dotenv
- joi (validación)
- multer (upload de archivos)
- winston (logging)
- cors
- helmet (seguridad)
- express-async-errors

Frontend:
- react
- react-dom
- react-router-dom
- @tanstack/react-query
- axios
- react-hook-form
- tailwindcss
- lucide-react (iconos)

CONFIGURACIÓN:

Backend .env:
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

Frontend .env:
VITE_API_URL=http://localhost:5000

REQUISITOS NO FUNCIONALES:

- ESLint configurado con reglas estándar
- Prettier para formateo consistente
- Manejo de errores en todas las capas
- Logs estructurados con Winston
- Código bien comentado (especialmente lógica compleja)
- Validación en frontend Y backend
- Responsive design (mobile-first con Tailwind)
- Loading states en todas las operaciones async
- Feedback claro al usuario (toasts/notificaciones)

ESTRUCTURA DE RESPUESTAS API:

Success:
{
  "success": true,
  "data": { ... },
  "message": "Trade creado exitosamente"
}

Error:
{
  "success": false,
  "error": {
    "message": "Error al crear trade",
    "details": [...],
    "code": "VALIDATION_ERROR"
  }
}

ROADMAP FUTURO:

Fase 1 (MVP): ✅ Lo que construiremos ahora
- CRUD trades
- CSV import
- Estadísticas básicas
- Upload imágenes

Fase 2: Dashboard avanzado
- Gráficos de P&L (Chart.js)
- Análisis por símbolo/estrategia
- Calendarios de trades

Fase 3: Autenticación
- Login/register
- Múltiples usuarios
- Trades privados por usuario

Fase 4: Features avanzadas
- Tags/categorías
- Journal/notas por trade
- Export CSV/PDF
- Backtesting simple

Fase 5: Integraciones
- Conexión con exchanges (Binance API)
- Import automático de trades
- Sincronización en tiempo real

INSTRUCCIONES PARA CLAUDE CODE:

1. Genera primero la estructura completa de carpetas
2. Crea el schema.sql completo con todos los objetos (tabla, índices, triggers, vistas)
3. Configura el backend con Express y conexión a PostgreSQL
4. Implementa primero el CSV import (es lo más importante)
5. Luego el formulario manual
6. Frontend con React + Tailwind
7. Integra React Query para data fetching
8. Implementa el modal de imágenes
9. Agrega las estadísticas básicas

Usa comentarios claros en español para explicar secciones clave del código.
