Aquí está el documento completo para pasarle al agente:

---

# Implementación: Sistema de Estrategias y Señales para Trading Journal

## Contexto del proyecto

Trading Journal full-stack existente y funcional. Stack: React 18 + Vite (frontend), Express.js (backend), PostgreSQL (base de datos). El proyecto ya tiene CRUD de trades, autenticación JWT, upload de imágenes, import CSV y estadísticas básicas. **No romper nada de lo existente.**

La arquitectura sigue el patrón: `routes → middleware → controllers → services → repositories → database`

Ambos lados usan ES modules (`"type": "module"`). El backend corre en puerto 5000, el frontend en 5173.

---

## Qué se va a implementar

Un sistema configurable por usuario para registrar el análisis técnico de cada trade. Todo es opcional — el trade funciona exactamente igual que hoy si el usuario no usa estas funciones.

---

## Modelo de datos — cambios a la DB

### Nuevas tablas

**`systems`** — sistemas de trading del usuario
```sql
id SERIAL PRIMARY KEY
user_id INTEGER NOT NULL REFERENCES users(id)
name VARCHAR(100) NOT NULL
description TEXT
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
deleted_at TIMESTAMP DEFAULT NULL
```

**`signals`** — señales que componen un sistema. Inmutables después de creación.
```sql
id SERIAL PRIMARY KEY
system_id INTEGER NOT NULL REFERENCES systems(id)
name VARCHAR(100) NOT NULL
uses_scale BOOLEAN DEFAULT FALSE
-- uses_scale=false → booleana (presente/ausente)
-- uses_scale=true → escala 1=débil, 2=media, 3=fuerte, 4=importante
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
deleted_at TIMESTAMP DEFAULT NULL
```

**`user_timeframes`** — timeframes configurados por el usuario, reutilizables
```sql
id SERIAL PRIMARY KEY
user_id INTEGER NOT NULL REFERENCES users(id)
label VARCHAR(20) NOT NULL -- ej: "1m", "5m", "1h", "4h", "Diario"
sort_order INTEGER DEFAULT 0
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**`trade_signals`** — señales registradas en un trade
```sql
id SERIAL PRIMARY KEY
trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE
signal_id INTEGER NOT NULL REFERENCES signals(id)
system_role VARCHAR(10) NOT NULL CHECK (system_role IN ('primary', 'secondary'))
value INTEGER NOT NULL DEFAULT 1
-- Para booleana: 1=presente (solo se guarda si está presente, nunca se guarda 0)
-- Para escala: 1=débil, 2=media, 3=fuerte, 4=importante
```

**`trade_timeframes`** — timeframes usados en un trade
```sql
id SERIAL PRIMARY KEY
trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE
timeframe_id INTEGER NOT NULL REFERENCES user_timeframes(id)
```

### Modificaciones a tabla `trades` existente
Agregar columnas nullable (no rompen nada existente):
```sql
ALTER TABLE trades ADD COLUMN primary_system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL;
ALTER TABLE trades ADD COLUMN secondary_system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL;
```

### Reglas de negocio importantes para la DB
- Un sistema no puede tener señales agregadas o eliminadas después de su creación. Esto se enforcea en el backend, no con constraints de DB.
- Soft delete en systems y signals: `deleted_at` no nulo significa archivado. Los trades que referencian sistemas/señales archivados mantienen su data histórica intacta.
- `trade_signals` solo guarda señales presentes. Una señal ausente simplemente no tiene registro.

---

## Backend — nuevos archivos y modificaciones

### Nuevas rutas
```
GET    /api/systems                    → listar sistemas del usuario autenticado
POST   /api/systems                    → crear sistema con sus señales
GET    /api/systems/:id                → obtener sistema con sus señales
PATCH  /api/systems/:id/name           → solo se puede editar el nombre
DELETE /api/systems/:id                → soft delete

GET    /api/timeframes                 → listar timeframes del usuario
POST   /api/timeframes                 → crear timeframe
DELETE /api/timeframes/:id             → eliminar (verificar que no haya trades usando este tf)
```

Todas requieren middleware `authenticate` existente.

### Archivos nuevos en backend

`src/repositories/system.repository.js` — todas las queries SQL de systems, signals, timeframes, trade_signals, trade_timeframes

`src/services/system.service.js` — lógica de negocio:
- Al crear sistema: insertar sistema + todas sus señales en transacción
- Al intentar agregar/eliminar señales después: lanzar error con mensaje claro
- Soft delete de sistema: verificar si tiene trades asociados, si tiene → soft delete, si no → delete físico

`src/controllers/system.controller.js` — thin controllers, delegan al service

`src/routes/system.routes.js` — rutas con authenticate middleware

`src/validators/system.validator.js` — schemas Joi:
- Crear sistema: name requerido, description opcional, signals array con mínimo 1 elemento, cada signal tiene name y uses_scale boolean
- Crear timeframe: label requerido, sort_order opcional

### Modificaciones a archivos existentes

`src/routes/trade.routes.js` — ya existe, solo agregar las rutas nuevas si hace falta

`src/repositories/trade.repository.js` — modificar queries de crear y editar trade para incluir:
- Insertar en `trade_signals` dentro de la misma transacción del trade
- Insertar en `trade_timeframes` dentro de la misma transacción
- Al obtener un trade, hacer JOIN o queries separadas para traer signals y timeframes asociados

`src/services/trade.service.js` — manejar la lógica de guardar signals y timeframes junto con el trade

`src/server.js` — registrar las nuevas rutas de systems y timeframes

### Respuesta al obtener un sistema (shape esperado)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Mi sistema principal",
    "description": "...",
    "signals": [
      { "id": 1, "name": "RSI Divergencia", "uses_scale": false },
      { "id": 2, "name": "Proyecciones", "uses_scale": true },
      { "id": 3, "name": "MACD Divergencia", "uses_scale": false }
    ],
    "created_at": "..."
  }
}
```

### Respuesta al obtener un trade (shape modificado)
El trade existente agrega:
```json
{
  "primary_system_id": 1,
  "secondary_system_id": null,
  "primary_system": {
    "id": 1,
    "name": "Mi sistema principal",
    "signals_present": [
      { "signal_id": 1, "name": "RSI Divergencia", "uses_scale": false, "value": 1 },
      { "signal_id": 2, "name": "Proyecciones", "uses_scale": true, "value": 3 }
    ]
  },
  "secondary_system": null,
  "timeframes": ["1m", "4h"]
}
```

---

## Frontend — nuevos archivos y modificaciones

### Nueva página de configuración
`src/pages/Settings.jsx` — página accesible desde el header con dos secciones:

**Sección "Mis sistemas":**
- Lista de sistemas existentes del usuario
- Botón crear nuevo sistema → abre modal
- Cada sistema muestra nombre, número de señales, opción de editar nombre y archivar
- Al archivar: confirmación indicando que los trades históricos se mantienen

**Modal crear sistema:**
- Campo nombre del sistema
- Campo descripción opcional
- Sección señales: lista dinámica donde el usuario agrega señales una por una
- Cada señal tiene: input nombre + toggle "usar escala"
- Mínimo 1 señal requerida
- Mensaje de advertencia visible: *"Una vez creado el sistema no podrás agregar ni eliminar señales. Define todas las señales antes de continuar."*
- Botón agregar señal / botón eliminar señal (solo disponible antes de guardar)

**Sección "Mis timeframes":**
- Lista simple de timeframes existentes
- Input para agregar nuevo timeframe
- Opción de eliminar (si no tiene trades asociados)
- Drag para reordenar (sort_order)

### Modificaciones al formulario de trade existente
`src/components/trades/CreateTradeForm.jsx` — agregar al final del formulario existente, sin tocar nada de lo actual:

Un enlace o botón pequeño y discreto: **"+ Agregar análisis técnico"**

Al hacer click despliega con animación suave una sección con:
- Select de sistema principal (carga los sistemas del usuario)
- Al seleccionar sistema, aparecen sus señales como checkboxes (si booleana) o select débil/media/fuerte/importante (si usa escala)
- Select múltiple de timeframes (carga los timeframes del usuario)
- Enlace pequeño: **"+ Sistema secundario"** que despliega otro bloque igual pero para el sistema secundario

Si el usuario no toca este enlace, el trade se guarda exactamente igual que hoy.

Si el usuario despliega la sección pero no selecciona sistema, no se guarda nada de análisis técnico.

### Modificaciones a TradeRow y TradeTable
`src/components/trades/TradeRow.jsx` — si el trade tiene sistema principal, mostrar un badge pequeño con el nombre del sistema. Nada más en la tabla para no saturar.

### Nuevos hooks
`src/hooks/useSystems.js` — React Query hooks para CRUD de sistemas
`src/hooks/useTimeframes.js` — React Query hooks para CRUD de timeframes

### Nuevos endpoints en frontend
`src/api/endpoints.js` — agregar funciones para systems y timeframes siguiendo el patrón existente

### Navegación
`src/components/layout/Header.jsx` — agregar enlace a Settings en el menú de usuario existente (UserMenu.jsx), no en la navegación principal para no saturar

---

## Reglas de negocio que el backend debe enforcar

1. **Inmutabilidad de señales**: Si se intenta POST a señales de un sistema ya creado → error 400 con mensaje *"Las señales de un sistema no pueden modificarse después de su creación"*

2. **Soft delete de sistemas con trades**: Si el sistema tiene trades asociados → soft delete (deleted_at). Si no tiene trades → delete físico. En ambos casos responder success al frontend.

3. **Señales de sistema archivado**: Al cargar el formulario de trade, no mostrar sistemas con deleted_at. Pero al mostrar un trade existente que usaba ese sistema, mostrar la info histórica correctamente.

4. **Timeframe en uso**: Si se intenta eliminar un timeframe que tiene trades asociados → error 400 indicando cuántos trades lo usan.

5. **Sistema secundario requiere primario**: Si viene secondary_system_id sin primary_system_id → error de validación.

6. **Señales pertenecen al sistema**: Validar que cada signal_id enviado en trade_signals efectivamente pertenece al system_id indicado. Prevenir que alguien envíe señales de otro sistema.

---

## Migraciones SQL necesarias

Crear archivo `database/migration_systems.sql` con todo el DDL nuevo en orden:
1. Crear tabla `systems`
2. Crear tabla `signals`
3. Crear tabla `user_timeframes`
4. Crear tabla `trade_signals`
5. Crear tabla `trade_timeframes`
6. ALTER TABLE trades para agregar las dos columnas nuevas
7. Índices: `idx_systems_user_id`, `idx_signals_system_id`, `idx_trade_signals_trade_id`, `idx_user_timeframes_user_id`

---

## Lo que NO debe cambiar

- El flujo actual de crear un trade funciona igual si no se usa la nueva sección
- La tabla de trades no cambia visualmente salvo el badge de sistema
- La autenticación, el CSV import, el upload de imágenes y las estadísticas actuales no se tocan
- El estilo visual sigue siendo el mismo — la nueva UI debe sentirse parte del mismo diseño

---

## Orden de implementación recomendado

1. Migration SQL
2. Repository de systems
3. Service y controller de systems
4. Rutas de systems registradas en server.js
5. Modificar trade repository y service para persistir signals y timeframes
6. Página Settings en frontend con gestión de sistemas y timeframes
7. Modificar CreateTradeForm con la sección colapsable
8. Modificar TradeRow para mostrar badge
9. Probar flujo completo end to end





  Resumen de cambios                                                           
                                                                                                                                                                                                                                                              
  Base de datos                                                                                                                                                                                                                                               
                                                                                                                                                                                                                                                              
  - database/migration_systems.sql — 5 tablas nuevas (systems, signals, user_timeframes, trade_signals, trade_timeframes) + ALTER TABLE trades para añadir primary_system_id / secondary_system_id + índices.                                                 
                                                                                                                                                                                                                                                              
  Backend (7 archivos)

  ┌───────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                Archivo                │                                                       Cambio                                                       │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/validators/system.validator.js    │ Nuevo — schemas Joi para crear sistema, editar nombre, crear timeframe                                             │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/repositories/system.repository.js │ Nuevo — todas las queries de sistemas, señales, timeframes y trade_signals                                         │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/services/system.service.js        │ Nuevo — lógica de negocio (soft-delete vs hard-delete según trades, validación timeframe en uso)                   │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/controllers/system.controller.js  │ Nuevo — controllers delgados para systems y timeframes                                                             │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/routes/system.routes.js           │ Nuevo — GET/POST /systems, GET/PATCH/DELETE /systems/:id, GET/POST/DELETE /timeframes                              │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/server.js                         │ Registra systemRoutes en /api                                                                                      │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/models/trade.model.js             │ Añade primary_system_id y secondary_system_id a TRADE_FIELDS                                                       │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/repositories/trade.repository.js  │ create/update/findById/findAll enriquecen trades con señales y timeframes                                          │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/services/trade.service.js         │ Valida que señales pertenecen al sistema antes de guardar                                                          │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/controllers/trade.controller.js   │ Parsea campos JSON (arrays) que llegan via FormData                                                                │
  ├───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/validators/trade.validator.js     │ Añade campos opcionales: primary_system_id, secondary_system_id, primary_signals, secondary_signals, timeframe_ids │
  └───────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Frontend (8 archivos)

  ┌───────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────┐
  │                  Archivo                  │                                            Cambio                                            │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/api/endpoints.js                      │ Añade endpoints de systems y timeframes; serializa arrays como JSON en FormData              │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/hooks/useSystems.js                   │ Nuevo — hooks React Query para CRUD de sistemas                                              │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/hooks/useTimeframes.js                │ Nuevo — hooks React Query para CRUD de timeframes                                            │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/pages/Settings.jsx                    │ Nueva página — gestión de sistemas (crear/editar nombre/archivar) y timeframes               │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/App.jsx                               │ Añade ruta /settings protegida                                                               │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/components/auth/UserMenu.jsx          │ Añade enlace "Configuración" al menú de usuario                                              │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/components/trades/CreateTradeForm.jsx │ Sección colapsable "Agregar análisis técnico" con selección de sistema, señales y timeframes │
  ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
  │ src/components/trades/TradeRow.jsx        │ Badge del sistema primario debajo del símbolo                                                │
  └───────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────┘

  El flujo existente no cambia en absoluto — si el usuario no toca la sección de análisis, el trade se guarda exactamente igual que antes.

