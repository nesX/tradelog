# Task: puesta en producción y documentación
2026-11-22 · Operaciones + Docs · Recordatorios de análisis 11/11 · Depende de: 016–025

Spec: §4.1 y §6 (pasos 11–12) de [alertas-de-precio-en-notas.md](../../features/specs/alertas-de-precio-en-notas.md).

## Objetivo
Activar el job en producción sin arriesgar la IP que compartimos con
market-tracker y dejar la feature documentada.

## Alcance

### 1. Medir el peso de market-tracker (antes de activar)
Desde la VPS, en varios momentos del día, incluidos los picos de market-tracker:

```bash
curl -s -D - -o /dev/null "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=1" \
  | grep -i x-mbx-used-weight-1m
```

Ajustar `BINANCE_MAX_USED_WEIGHT` (default 1200, sobre un límite de 2400/min)
para que TradeLog se aparte con margen cuando market-tracker esté en un pico.

### 2. Despliegue
- Aplicar `028_migration_price_alerts_and_reminders.sql` en prod después de la
  027 (a mano, ver `docs/operations/database-ops.md`).
- `.env` de prod: `REMINDERS_TICK_MINUTES=30`, `BINANCE_FUTURES_API_URL` y
  `BINANCE_MAX_USED_WEIGHT`.
- En los logs del primer tick: el sync del catálogo (una llamada) y ninguna
  petición de velas mientras no haya alertas.
- Una alerta de prueba con el nivel ya cruzado genera su tarjeta en el
  siguiente tick; después, borrarla.
- Un deploy no adelanta el tick siguiente.

### 3. Documentación
- `docs/api/reference.md`: los 13 endpoints y los campos `price_alerts` y
  `date_reminders` de `GET /api/notes/:id`.
- `docs/architecture/database.md`: las tablas de la 028 y el trigger de
  re-anclaje.
- `docs/architecture/backend.md`: la carpeta `src/clients/` y el job.
- `docs/operations/env-vars.md`: las tres variables.
- `CLAUDE.md`: los mount points nuevos y la página `/recordatorios`.
- `docs/features/README.md` y `docs/roadmap.md`: estado ✅ Implementado.
- El paso 12 de la spec pide quitar del roadmap "alertas de precio aplazadas
  hasta Market Tracker v2", pero esa línea no está en `docs/roadmap.md`
  (revisado el 2026-11-22): no hay nada que quitar.
- Mover las tasks 016–026 a `docs/tasks/done/`.

## Criterios de aceptación
- El job corre en prod cada 30 min con el umbral de peso ajustado a lo medido.
- La alerta de prueba llega a la bandeja.
- La documentación refleja los endpoints, las tablas, las variables y el job.

## Estado (2026-11-22)
- Documentación (sección 3) hecha: `api/reference.md`, `architecture/database.md`,
  `architecture/backend.md`, `operations/env-vars.md`, `CLAUDE.md`, README de
  specs y roadmap. Tasks 016–025 movidas a `done/`.
- Peso medido desde la VPS (2026-11-22, 17:22–17:27, un curl cada 10 s): el
  contador solo reflejó los propios curls (1→6 y vuelta a 1 cada minuto), así
  que market-tracker no consume peso de futuros (spot cuenta aparte). Se deja
  `BINANCE_MAX_USED_WEIGHT` en 1200. Pendiente opcional: repetir alrededor de
  un cambio de hora (:00) por si market-tracker tiene picos programados.
- Pendiente (necesita prod): aplicar la 028 en prod después de la 027
  (`docker exec -i market-tracker-postgres-1 psql -U tradelog_user -d tradelog < trading-journal/database/028_migration_price_alerts_and_reminders.sql`),
  las variables en el `.env` de prod y las comprobaciones del primer tick.
- **Orden obligatorio: la 028 en prod ANTES del push a `main`** (cada push
  despliega solo). `GET /api/notes/:id` ya consulta `price_alerts` y
  `market_symbols`: sin la migración, no se abre ninguna nota. La 027
  (pendientes, sin commitear) va antes.
- Sin las variables, el job arranca con los defaults (30 min, umbral 1200).


## Cierre (2026-11-23)
Confirmado por el dueño del proyecto: los recordatorios funcionan en prod (migración 028 aplicada y job activo).
Sigue abierto, como opcional, repetir la medición de peso alrededor de un
cambio de hora.
