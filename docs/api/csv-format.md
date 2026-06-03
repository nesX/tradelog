# CSV Import — Format Spec

El importador de trades acepta CSV con separador `;` (punto y coma) y header obligatorio.

## Formato

```csv
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2025-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;Breakout trade
2025-01-16 09:15;ETHUSDT;SHORT;2500.00;;0.5;;Esperando confirmación
```

## Columnas

| # | Header | Tipo | Requerido | Notas |
|---|--------|------|-----------|-------|
| 1 | `fecha` | timestamp | sí | Formatos aceptados: `YYYY-MM-DD HH:mm`, `YYYY-MM-DDTHH:mm:ss`, ISO completo. |
| 2 | `simbolo` | string | sí | Se convierte a uppercase. Máximo 20 chars. |
| 3 | `tipo` | enum | sí | `LONG` o `SHORT` (case-insensitive). |
| 4 | `precio_entrada` | number > 0 | sí | Acepta coma o punto decimal. |
| 5 | `precio_salida` | number > 0 | opcional | Vacío = trade abierto (`status=OPEN`). |
| 6 | `cantidad` | number > 0 | sí | |
| 7 | `comisiones` | number ≥ 0 | opcional | Default 0. |
| 8 | `notas` | string | opcional | |

## Reglas

- **Separador**: punto y coma (`;`). Si tu fuente usa coma, conviértelo antes.
- **Encoding**: UTF-8. Tildes y caracteres latinos están OK.
- **Decimal**: tanto `42000.50` como `42000,50` son válidos (el parser normaliza).
- **Fechas con espacio**: `2025-01-15 10:30` se acepta y se interpreta como hora local.
- **Fecha ISO con T**: `2025-01-15T10:30:00Z` se interpreta como UTC.
- **`precio_salida` vacío**: el trade se guarda como `OPEN` (status); `pnl` y `pnl_percentage` quedan `NULL` hasta que se actualice.
- **`status` se infiere** de `precio_salida` (vacío → OPEN, presente → CLOSED). No se pasa en el CSV.
- **Sin imágenes**: el importador no soporta imágenes — agregar después manualmente.

## Flujo de importación

1. Usuario pega o sube el CSV en la UI.
2. Frontend llama `POST /api/trades/import/preview` con el texto.
3. Backend (en `csvParser.service.js`) parsea línea por línea, valida con Joi, devuelve:
   ```json
   {
     "valid": [
       { "line": 2, "data": { "symbol": "BTCUSDT", "trade_type": "LONG", ... } }
     ],
     "errors": [
       { "line": 3, "errors": [{ "field": "precio_entrada", "message": "must be a positive number" }] }
     ]
   }
   ```
4. La UI muestra el preview con conteos (válidos vs error), permite corregir el texto y reintentar.
5. Si el usuario confirma, llama `POST /api/trades/import` (mismo body). El backend reusa el parser y **solo guarda los válidos** — los errores se descartan silenciosamente (el usuario ya los vio en preview).

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `must be a number` en `precio_entrada` | Header en inglés (`entry_price`) o separador wrong (coma en vez de `;`). | Usar headers exactos en español + `;`. |
| `is not allowed to be empty` en `simbolo` | Fila vacía o columna corrida. | Validar conteo de `;` por fila. |
| `must be one of [LONG, SHORT]` | Typo en `tipo` (e.g. `Long`, `compra`). | El parser hace uppercase pero solo acepta LONG/SHORT literal. |
| `Invalid date format` | Fecha con `/` o formato no estándar (e.g. `15/01/2025`). | Convertir a `YYYY-MM-DD HH:mm`. |

## Ejemplo mínimo válido

```csv
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2026-01-15 10:30;BTCUSDT;LONG;42000.50;43500.00;0.1;5.50;
```

## Ejemplo con trade abierto

```csv
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2026-01-15 10:30;ETHUSDT;LONG;2500;;1.5;0;En proceso
```

## Ejemplo con coma decimal y SHORT

```csv
fecha;simbolo;tipo;precio_entrada;precio_salida;cantidad;comisiones;notas
2026-01-20 14:45;SOLUSDT;SHORT;125,30;110,80;10;0,5;Distribución en resistencia
```
