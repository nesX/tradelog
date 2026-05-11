# Referencias de Trades en Notas

## Resumen ejecutivo

Insertar en una nota un bloque tipo **galería de trades** con N tarjetas horizontales — visualmente similar al bloque `image_gallery`. Cada tarjeta muestra un trade del usuario con su primera imagen, símbolo, side y P&L. Click sobre la tarjeta abre el modal existente (`ImageViewer`) con todas las imágenes + `notes` + `post_analysis`. Los datos visuales de la tarjeta viajan **inline** en el payload de la nota (una sola query); el detalle pesado se difiere al click.

Antes del bloque hay un prerequisito: añadir un botón "Copiar referencia" en el menú de cada fila del Historial de Trades, ya que hoy no existe forma de obtener la URL de un trade.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Tipo de bloque | Nuevo `block_type = 'trade_reference'` |
| Layout | Scroll horizontal (espejo de `image_gallery`) |
| Tarjeta | Compacta ~140×110: imagen arriba, abajo `symbol + P&L` |
| Sin imagen | Fondo gris neutro, símbolo grande + badge LONG/SHORT |
| Trade borrado (soft delete) | `LEFT JOIN` + placeholder "Trade no disponible" |
| Insertar trade al bloque | Pegar URL una a una con botón "+" persistente al final |
| Storage | Tabla pivote `note_block_trades(id, block_id, trade_id, position)` |
| Carga de datos | **Enfoque A inline**: extender `getById` con JOIN a trades + primera imagen. Cards completas al abrir la nota. |
| Detalle pesado (modal) | `GET /api/trades/:id` con `useTrade(id)` al hacer click |
| URL del trade | `${origin}/?trade={id}` — navegable, abre Home con el modal del trade abierto |
| Botón "Copiar referencia" en trade | Item nuevo en menú `MoreVertical` de `TradeRow` |
| Click en tarjeta | Modal in-place (`ImageViewer` montado al click) — no navega |
| Reordenar tarjetas | No en v1 (campo `position` se asigna al insertar y no se cambia) |
| Cache navegador | Solo memoria de React Query por ahora; localStorage persister como mejora futura |
| Snapshot al insertar | No — siempre datos actuales del trade |

## 1. Backend

### 1.1 Migración SQL

`database/023_migration_trade_reference_block.sql`:

```sql
BEGIN;

-- 1. Permitir el nuevo block_type
ALTER TABLE note_blocks DROP CONSTRAINT IF EXISTS note_blocks_block_type_check;
ALTER TABLE note_blocks ADD CONSTRAINT note_blocks_block_type_check
  CHECK (block_type IN ('text', 'image_gallery', 'reference', 'callout', 'trade_reference'));

-- 2. Tabla pivote bloque ↔ trades
CREATE TABLE note_block_trades (
  id         SERIAL PRIMARY KEY,
  block_id   INTEGER NOT NULL REFERENCES note_blocks(id) ON DELETE CASCADE,
  trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(block_id, trade_id)
);

CREATE INDEX idx_note_block_trades_block_id ON note_block_trades(block_id);
CREATE INDEX idx_note_block_trades_trade_id ON note_block_trades(trade_id);

COMMIT;
```

Notas:
- `ON DELETE CASCADE` desde `note_blocks`: si se borra el bloque, se borran los vínculos.
- `ON DELETE CASCADE` desde `trades`: si un trade se elimina **definitivamente** (no soft delete), también desaparece del bloque. Para soft delete (`deleted_at`) los vínculos siguen ahí y el `LEFT JOIN` les pone `null`.
- `UNIQUE(block_id, trade_id)`: el mismo trade no se duplica en el mismo bloque.

Aplicación:
```bash
sudo docker exec -i tradelog-db psql -U postgres -d tradelog < database/023_migration_trade_reference_block.sql
```

### 1.2 Validador (`backend/src/validators/note.validator.js`)

```js
// createBlockSchema — añadir el nuevo type:
block_type: Joi.string()
  .valid('text', 'image_gallery', 'reference', 'callout', 'trade_reference')
  .required(),

// metadata — opcional, sin campos obligatorios (el bloque trade_reference no usa metadata)
```

Nuevo schema para añadir trade al bloque:
```js
export const addTradeToBlockSchema = Joi.object({
  trade_id: Joi.number().integer().positive().required(),
});
```

### 1.3 Repositorio (`backend/src/repositories/note.repository.js`)

**Extender `getById`** (línea 26) — añadir un `json_agg` correlated por bloque para los trades:

```sql
SELECT nb.*,
  COALESCE(
    (SELECT json_agg(
      json_build_object('id', nbi.id, 'image_path', nbi.image_path,
                        'caption', nbi.caption, 'position', nbi.position,
                        'created_at', nbi.created_at)
      ORDER BY nbi.position ASC)
     FROM note_block_images nbi WHERE nbi.block_id = nb.id), '[]'
  ) AS images,
  COALESCE(
    (SELECT json_agg(
      json_build_object(
        'id', t.id,
        'symbol', t.symbol,
        'side', t.trade_type,
        'status', t.status,
        'pnl', t.pnl,
        'pnl_percentage', t.pnl_percentage,
        'entry_date', t.entry_date,
        'first_image', (SELECT ti.filename FROM trade_images ti
                        WHERE ti.trade_id = t.id ORDER BY ti.id LIMIT 1)
      ) ORDER BY nbt.position ASC)
     FROM note_block_trades nbt
     LEFT JOIN trades t ON t.id = nbt.trade_id AND t.deleted_at IS NULL
     WHERE nbt.block_id = nb.id), '[]'
  ) AS trades,
  ln.title AS linked_note_title
FROM note_blocks nb
LEFT JOIN notes ln ON ln.id = nb.linked_note_id AND ln.deleted_at IS NULL
WHERE nb.note_id = $1
ORDER BY nb.position COLLATE "C" ASC
```

Nuevas funciones repo:

```js
export const addTradeToBlock = async (blockId, tradeId) => {
  const posResult = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
     FROM note_block_trades WHERE block_id = $1`,
    [blockId]
  );
  const position = posResult.rows[0].next_pos;
  const result = await pool.query(
    `INSERT INTO note_block_trades (block_id, trade_id, position)
     VALUES ($1, $2, $3)
     ON CONFLICT (block_id, trade_id) DO NOTHING
     RETURNING *`,
    [blockId, tradeId, position]
  );
  return result.rows[0] || null;
};

export const removeTradeFromBlock = async (blockId, tradeId) => {
  await pool.query(
    `DELETE FROM note_block_trades WHERE block_id = $1 AND trade_id = $2`,
    [blockId, tradeId]
  );
};

export const getBlockOwner = async (blockId) => {
  const result = await pool.query(
    `SELECT n.user_id, nb.block_type
     FROM note_blocks nb JOIN notes n ON n.id = nb.note_id
     WHERE nb.id = $1 AND n.deleted_at IS NULL`,
    [blockId]
  );
  return result.rows[0] || null;
};
```

### 1.4 Service (`backend/src/services/note.service.js`)

```js
export const addTradeToBlock = async (userId, blockId, tradeId) => {
  const owner = await repo.getBlockOwner(blockId);
  if (!owner || owner.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  if (owner.block_type !== 'trade_reference') {
    throw new ValidationError('Solo se pueden añadir trades a bloques trade_reference');
  }
  const trade = await tradeRepo.findById(userId, tradeId);
  if (!trade) throw new NotFoundError('Trade no encontrado');
  return repo.addTradeToBlock(blockId, tradeId);
};

export const removeTradeFromBlock = async (userId, blockId, tradeId) => {
  const owner = await repo.getBlockOwner(blockId);
  if (!owner || owner.user_id !== userId) throw new NotFoundError('Bloque no encontrado');
  await repo.removeTradeFromBlock(blockId, tradeId);
};
```

Adicionalmente actualizar:
- `buildNoteTree` y `renderMarkdownTree` (export JSON/Markdown) para manejar `trade_reference` — emitir `{ type: 'trade_reference', trade_ids: [...] }` en JSON y una lista de `→ Trade #{id} ({symbol})` en Markdown.

### 1.5 Rutas (`backend/src/routes/note.routes.js`)

Dos endpoints nuevos:

```
POST   /api/notes/blocks/:blockId/trades       body: { trade_id }
DELETE /api/notes/blocks/:blockId/trades/:tradeId
```

### 1.6 Sin cambios necesarios

- `GET /api/trades/:id` ya existe y devuelve lo que el modal necesita.
- `trade.repository.findById` se reusa para validar ownership en el service.

## 2. Frontend

### 2.1 Helper de URLs (`utils/referenceLinks.js`)

```js
export const buildTradeUrl = (tradeId) => `${getBaseUrl()}/?trade=${tradeId}`;

const TRADE_REGEX = /[?&]trade=(\d+)/;
export const parseTradeUrl = (input) => {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().match(TRADE_REGEX);
  if (!match) return null;
  const tradeId = parseInt(match[1], 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0) return null;
  return { tradeId };
};
```

`parseReferenceUrl` queda intacta — son contratos separados.

### 2.2 Botón "Copiar referencia" en `TradeRow.jsx`

Añadir un item al menú `MoreVertical` entre "Editar" y "Eliminar":

```jsx
<button
  onClick={() => {
    navigator.clipboard.writeText(buildTradeUrl(trade.id));
    toast.success('Referencia copiada');
    setShowActions(false);
  }}
  className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
>
  <Link2 className="w-4 h-4 mr-2" />
  Copiar referencia
</button>
```

Imports: `Link2` de `lucide-react`, `buildTradeUrl` de `utils/referenceLinks`, `useToast` del Toast provider.

**Nota HTTPS**: `navigator.clipboard.writeText` requiere contexto seguro. Mismo caveat que el botón de referencias actual.

### 2.3 Hook nuevo en `useNotes.js`

```js
export const useAddTradeToBlock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, tradeId }) => api.addTradeToBlock(blockId, tradeId),
    onSuccess: (_, { noteId }) =>
      queryClient.invalidateQueries({ queryKey: ['notes', 'detail', noteId] }),
  });
};

export const useRemoveTradeFromBlock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, tradeId }) => api.removeTradeFromBlock(blockId, tradeId),
    onSuccess: (_, { noteId }) =>
      queryClient.invalidateQueries({ queryKey: ['notes', 'detail', noteId] }),
  });
};
```

Y en `api/endpoints.js`:
```js
export const addTradeToBlock = (blockId, tradeId) =>
  apiClient.post(`/api/notes/blocks/${blockId}/trades`, { trade_id: tradeId });
export const removeTradeFromBlock = (blockId, tradeId) =>
  apiClient.delete(`/api/notes/blocks/${blockId}/trades/${tradeId}`);
```

### 2.4 Componente nuevo `NoteTradeReferenceBlock.jsx`

Ubicación: `frontend/src/components/notes/NoteTradeReferenceBlock.jsx`.

Estructura:

```jsx
const NoteTradeReferenceBlock = ({ block, noteId }) => {
  const trades = block.trades || [];        // viene inline del backend
  const [urlInput, setUrlInput] = useState('');
  const [parseError, setParseError] = useState(null);
  const [openTradeId, setOpenTradeId] = useState(null);  // controla modal

  const addTrade = useAddTradeToBlock();
  const removeTrade = useRemoveTradeFromBlock();

  const handlePaste = (value) => {
    setUrlInput(value);
    if (!value.trim()) { setParseError(null); return; }
    const parsed = parseTradeUrl(value);
    if (!parsed) { setParseError('URL de trade no válida'); return; }
    setParseError(null);
    addTrade.mutate({ blockId: block.id, tradeId: parsed.tradeId, noteId });
    setUrlInput('');
  };

  const activeTrade = trades.find((t) => t?.id === openTradeId);

  return (
    <div className="py-2 px-1">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {trades.map((trade) => (
          <TradeCard
            key={trade?.id ?? `null-${Math.random()}`}
            trade={trade}
            onOpen={() => trade && setOpenTradeId(trade.id)}
            onRemove={() => trade && removeTrade.mutate({ blockId: block.id, tradeId: trade.id, noteId })}
          />
        ))}

        {/* Tile "+" persistente al final */}
        <div className="flex-shrink-0 w-[140px] h-[110px] flex flex-col gap-1">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => handlePaste(e.target.value)}
            placeholder="Pegar URL del trade"
            className="..."
          />
          {parseError && <span className="text-xs text-red-500">{parseError}</span>}
        </div>
      </div>

      {/* Modal montado solo al abrir */}
      {activeTrade && (
        <TradeDetailModal
          tradeId={activeTrade.id}
          isOpen={!!activeTrade}
          onClose={() => setOpenTradeId(null)}
        />
      )}
    </div>
  );
};
```

`TradeCard` (sub-componente, mismo archivo o aparte):

```jsx
const TradeCard = ({ trade, onOpen, onRemove }) => {
  if (!trade) {
    return (
      <div className="flex-shrink-0 w-[140px] h-[110px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-400 italic">
        Trade no disponible
      </div>
    );
  }

  const imgUrl = trade.first_image
    ? `${API_BASE}/api/images/${trade.first_image}`
    : null;
  const pnlClass = trade.pnl > 0 ? 'text-profit' : trade.pnl < 0 ? 'text-loss' : 'text-gray-400';
  const sideClass = trade.side === 'LONG' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

  return (
    <div className="group flex-shrink-0 w-[140px]">
      <div className="relative">
        <button
          onClick={onOpen}
          className="w-[140px] h-[110px] rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors"
        >
          {imgUrl ? (
            <div className="w-full h-[80px] bg-gray-100 dark:bg-gray-800">
              <img src={imgUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-full h-[80px] flex flex-col items-center justify-center gap-1 bg-gray-100 dark:bg-gray-800">
              <span className="text-lg font-bold text-gray-600 dark:text-gray-300">{trade.symbol}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${sideClass}`}>{trade.side}</span>
            </div>
          )}
          <div className="h-[30px] px-2 flex items-center justify-between bg-white dark:bg-gray-800">
            <span className="text-xs font-medium">{trade.symbol}</span>
            <span className={`text-xs font-mono ${pnlClass}`}>
              {formatPercentage(trade.pnl_percentage)}
            </span>
          </div>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 ... opacity-0 group-hover:opacity-100"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
```

`TradeDetailModal`:

```jsx
const TradeDetailModal = ({ tradeId, isOpen, onClose }) => {
  const { data: trade, isLoading } = useTrade(tradeId);

  if (isLoading || !trade) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <Loading />
      </Modal>
    );
  }

  return (
    <ImageViewer
      images={trade.images || []}
      alt={`Trade ${trade.symbol}`}
      notes={trade.notes}
      postAnalysis={trade.post_analysis}
      externalOpen={isOpen}
      onExternalOpenChange={(v) => !v && onClose()}
    />
  );
};
```

### 2.5 Dispatcher en `NoteBlockList.jsx`

En `BlockContent` (línea 28) añadir:

```jsx
{block.block_type === 'trade_reference' && (
  <NoteTradeReferenceBlock block={block} noteId={noteId} />
)}
```

Revisar la condición `block.block_type !== 'reference'` (línea 103) que oculta `<CopyReferenceButton>`: ese botón apunta al bloque (no al trade), así que **sigue siendo útil** en bloques `trade_reference`. No hace falta excluirlo.

### 2.6 Opción en menú insertar (`NoteBlockInsert.jsx`)

Añadir al array `BLOCK_OPTIONS`:

```js
{ type: 'trade_reference', label: 'Trades', icon: TrendingUp, color: 'text-emerald-500' },
```

Ramificar `insert()`:

```js
} else if (block_type === 'trade_reference') {
  await createBlock.mutateAsync({
    noteId,
    data: { block_type: 'trade_reference', position, metadata: {} },
  });
}
```

### 2.7 Handler de `?trade=` en `Home.jsx` (opcional v1)

Si querés que la URL copiada efectivamente abra el modal del trade al pegarla en una pestaña nueva:

```jsx
const [searchParams] = useSearchParams();
const tradeIdFromUrl = searchParams.get('trade');

useEffect(() => {
  if (!tradeIdFromUrl || !data?.trades) return;
  const trade = data.trades.find(t => t.id === parseInt(tradeIdFromUrl, 10));
  if (trade) {
    // mostrar modal del trade
  }
}, [tradeIdFromUrl, data]);
```

Esto implica controlar el modal del `TradeRow` desde arriba (hoy es estado interno). **Puede diferirse** — para v1 el flujo principal del usuario es: copiar URL → pegar en bloque → ver tarjeta en nota. Abrir la URL "raw" en navegador es secundario.

## 3. Orden de implementación

1. **Migración SQL** `023_migration_trade_reference_block.sql` (aplicar y validar conteos).
2. **Backend**:
   - Validador acepta el nuevo type
   - Repo: extender `getById`, añadir `addTradeToBlock` / `removeTradeFromBlock` / `getBlockOwner`
   - Service: validaciones de ownership
   - Rutas: dos endpoints nuevos
   - Tests rápidos con curl: crear bloque → añadir trade → cargar nota y ver el array `trades` en el payload → quitar trade.
3. **Frontend utilidades**: `buildTradeUrl` y `parseTradeUrl` en `referenceLinks.js`.
4. **Botón "Copiar referencia" en `TradeRow.jsx`** (independiente, ya útil sin el bloque).
5. **`NoteTradeReferenceBlock` + `TradeCard` + `TradeDetailModal`**.
6. **Hooks** `useAddTradeToBlock` / `useRemoveTradeFromBlock` en `useNotes.js` y endpoints en `api/endpoints.js`.
7. **Dispatcher** en `NoteBlockList.jsx` + **opción** en `NoteBlockInsert.jsx`.
8. **Exports JSON/Markdown** en `note.service.js` para el nuevo type.
9. **QA**:
   - Trade con imágenes → copiar referencia → pegar en bloque → ver tarjeta con miniatura → click → modal con `ImageViewer`
   - Trade sin imágenes → ver placeholder gris con símbolo + side
   - Borrar trade desde Home → recargar nota → tarjeta como "Trade no disponible"
   - Bloque vacío después de borrar última tarjeta → input pegar URL persiste
   - Varios trades en horizontal con scroll
10. **(Opcional)** Handler `?trade=` en Home.

## 4. Diferido a v2 (no implementar ahora)

- Drag & drop para reordenar tarjetas dentro del bloque
- Combobox/picker inline para añadir trade sin URL
- Bulk paste (multilínea, una URL por línea)
- Endpoint batch para múltiples trades en una request
- Página `/trades/:id` independiente
- localStorage persister de React Query (anotar para cuando notas con muchos trades empiecen a sentirse lentas tras recarga)
- Backlinks "qué notas referencian este trade"
- Snapshot de datos al insertar (`symbol`, `pnl` congelados al momento de añadir)

## 5. Archivos a tocar (resumen)

**Backend nuevo:**
- `database/023_migration_trade_reference_block.sql`

**Backend modificar:**
- `backend/src/validators/note.validator.js` — aceptar `trade_reference` + `addTradeToBlockSchema`
- `backend/src/repositories/note.repository.js` — extender `getById`, añadir `addTradeToBlock`, `removeTradeFromBlock`, `getBlockOwner`
- `backend/src/services/note.service.js` — `addTradeToBlock`, `removeTradeFromBlock`, manejar el type en exports
- `backend/src/routes/note.routes.js` — dos rutas nuevas
- `backend/src/controllers/note.controller.js` — dos handlers nuevos

**Frontend nuevo:**
- `frontend/src/components/notes/NoteTradeReferenceBlock.jsx` (incluye `TradeCard` y `TradeDetailModal` o como hijos)

**Frontend modificar:**
- `frontend/src/utils/referenceLinks.js` — `buildTradeUrl`, `parseTradeUrl`
- `frontend/src/api/endpoints.js` — `addTradeToBlock`, `removeTradeFromBlock`
- `frontend/src/hooks/useNotes.js` — `useAddTradeToBlock`, `useRemoveTradeFromBlock`
- `frontend/src/components/trades/TradeRow.jsx` — item "Copiar referencia" en menú
- `frontend/src/components/notes/NoteBlockList.jsx` — dispatcher del nuevo type
- `frontend/src/components/notes/NoteBlockInsert.jsx` — opción "Trades" en menú
- `frontend/src/pages/Home.jsx` — (opcional) handler `?trade=`

**Sin cambios:**
- `hooks/useTrades.js` — `useTrade` ya existe
- `components/common/ImageViewer.jsx` — ya soporta `externalOpen`, `notes`, `postAnalysis`
- `routes/trade.routes.js` — `GET /api/trades/:id` ya existe
