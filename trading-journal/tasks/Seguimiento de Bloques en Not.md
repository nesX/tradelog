# Feature: Seguimiento de Bloques en Notas

## 1. Resumen

Permitir marcar bloques individuales como "en seguimiento" para facilitar la revisión periódica de operaciones abiertas, ideas pendientes y observaciones que requieren resolución posterior. La feature añade además una vista de Revisión que centraliza todos los bloques pendientes y la actividad reciente.

### Objetivos de diseño

- **Manual y explícito**: el usuario controla cuándo activar y desactivar el seguimiento.
- **Bajo costo de uso**: un toggle por bloque, sin formularios adicionales.
- **Performance-friendly**: una sola columna booleana indexada con índice parcial.
- **Compatible con el modelo actual**: extensión de la tabla de bloques sin tocar `metadata JSONB`.
- **Reutilizable para IA futura**: el flag es señal limpia de "este bloque era relevante para seguimiento".

---

## 2. Cambios en base de datos

### 2.1 Migración

Nuevo archivo: `database/migration_block_follow_up.sql`

```sql
-- Agregar columna de seguimiento a bloques
ALTER TABLE note_blocks
  ADD COLUMN requires_follow_up BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial: solo indexa bloques en seguimiento
-- Ordenamiento por updated_at ASC para "más antiguos primero"
CREATE INDEX idx_note_blocks_follow_up
  ON note_blocks (user_id, updated_at ASC)
  WHERE requires_follow_up = true AND deleted_at IS NULL;

-- Índice para vista de actividad reciente (filtro por tiempo)
-- Solo si no existe ya un índice equivalente
CREATE INDEX IF NOT EXISTS idx_note_blocks_user_updated
  ON note_blocks (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
```

> **Nota:** ajustar `note_blocks` al nombre real de la tabla en tu esquema. El índice parcial es clave para performance: en una tabla con miles de bloques, solo se indexa la fracción activa de seguimiento (esperablemente < 10%).

### 2.2 Actualizar `database/schema.sql`

Reflejar la nueva columna en la definición de la tabla para nuevos despliegues:

```sql
requires_follow_up BOOLEAN NOT NULL DEFAULT false,
```

---

## 3. Backend

### 3.1 Repository — `note-block.repository.js`

Añadir tres métodos nuevos. Todas las queries scopadas por `user_id` para aislar datos entre usuarios.

```javascript
/**
 * Marca o desmarca un bloque como en seguimiento.
 * @param {number} blockId
 * @param {number} userId
 * @param {boolean} requiresFollowUp
 * @returns {Promise<Object>} bloque actualizado
 */
async function setFollowUp(blockId, userId, requiresFollowUp) {
  const query = `
    UPDATE note_blocks
    SET requires_follow_up = $3
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING *
  `;
  const result = await db.query(query, [blockId, userId, requiresFollowUp]);
  return result.rows[0] || null;
}

/**
 * Obtiene todos los bloques en seguimiento del usuario,
 * ordenados de más antiguos a más recientes.
 * Incluye datos de la nota padre para mostrar contexto.
 */
async function findPendingFollowUp(userId) {
  const query = `
    SELECT
      b.id, b.note_id, b.type, b.content, b.metadata,
      b.created_at, b.updated_at,
      n.title AS note_title, n.parent_id AS note_parent_id
    FROM note_blocks b
    INNER JOIN notes n ON n.id = b.note_id
    WHERE b.user_id = $1
      AND b.requires_follow_up = true
      AND b.deleted_at IS NULL
      AND n.deleted_at IS NULL
    ORDER BY b.updated_at ASC
  `;
  const result = await db.query(query, [userId]);
  return result.rows;
}

/**
 * Obtiene bloques actualizados dentro de un rango de tiempo.
 * @param {number} userId
 * @param {number} hoursBack - 24, 48, 168 (1 semana)
 */
async function findRecentActivity(userId, hoursBack) {
  const query = `
    SELECT
      b.id, b.note_id, b.type, b.content, b.metadata,
      b.requires_follow_up, b.created_at, b.updated_at,
      n.title AS note_title, n.parent_id AS note_parent_id
    FROM note_blocks b
    INNER JOIN notes n ON n.id = b.note_id
    WHERE b.user_id = $1
      AND b.updated_at >= NOW() - ($2 || ' hours')::INTERVAL
      AND b.deleted_at IS NULL
      AND n.deleted_at IS NULL
    ORDER BY b.updated_at DESC
    LIMIT 200
  `;
  const result = await db.query(query, [userId, hoursBack]);
  return result.rows;
}
```

> **Decisión sobre LIMIT**: 200 es un techo de seguridad para que la vista nunca degrade aunque alguien haya editado masivamente. La paginación real se puede agregar si en uso real se llega al tope.

### 3.2 Service — `note-block.service.js`

```javascript
/**
 * Toggle del flag de seguimiento.
 * Lanza NotFoundError si el bloque no existe o no pertenece al usuario.
 */
async function toggleFollowUp(blockId, userId, requiresFollowUp) {
  const block = await noteBlockRepository.setFollowUp(
    blockId,
    userId,
    requiresFollowUp
  );
  if (!block) {
    throw new NotFoundError('Bloque no encontrado');
  }
  return block;
}

async function getReviewData(userId, recentHours = 24) {
  // Ejecuta ambas queries en paralelo
  const [pending, recent] = await Promise.all([
    noteBlockRepository.findPendingFollowUp(userId),
    noteBlockRepository.findRecentActivity(userId, recentHours)
  ]);

  return {
    pending,         // bloques en seguimiento, ordenados ASC
    recent,          // actividad reciente, ordenada DESC
    recentHours      // ventana usada (para confirmar al cliente)
  };
}
```

### 3.3 Controller — `note-block.controller.js`

```javascript
async function toggleFollowUp(req, res, next) {
  try {
    const blockId = parseInt(req.params.id, 10);
    const { requires_follow_up } = req.body;
    const block = await noteBlockService.toggleFollowUp(
      blockId,
      req.user.id,
      Boolean(requires_follow_up)
    );
    return successResponse(res, block, 'Estado de seguimiento actualizado');
  } catch (err) {
    next(err);
  }
}

async function getReview(req, res, next) {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    // Validación: solo permitir valores conocidos
    const allowed = [24, 48, 168];
    if (!allowed.includes(hours)) {
      throw new ValidationError('hours debe ser 24, 48 o 168');
    }
    const data = await noteBlockService.getReviewData(req.user.id, hours);
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
}
```

### 3.4 Validador — `note-block.validator.js`

```javascript
export const toggleFollowUpSchema = Joi.object({
  requires_follow_up: Joi.boolean().required()
});
```

### 3.5 Rutas — `note-block.routes.js`

```javascript
// Toggle de seguimiento por bloque
router.patch(
  '/:id/follow-up',
  authenticate,
  validate(toggleFollowUpSchema),
  noteBlockController.toggleFollowUp
);

// Vista de revisión (pendientes + actividad reciente)
router.get(
  '/review',
  authenticate,
  noteBlockController.getReview
);
```

> **Importante:** la ruta `/review` debe declararse **antes** de cualquier ruta con `/:id` para evitar que Express interprete "review" como un id.

---

## 4. Frontend

### 4.1 Endpoints — `api/endpoints.js`

```javascript
export const blocksApi = {
  // ... endpoints existentes
  toggleFollowUp: (blockId, requiresFollowUp) =>
    client.patch(`/blocks/${blockId}/follow-up`, {
      requires_follow_up: requiresFollowUp
    }),
  getReview: (hours = 24) =>
    client.get('/blocks/review', { params: { hours } })
};
```

### 4.2 Hook — `hooks/useBlockFollowUp.js`

```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blocksApi } from '../api/endpoints';
import { noteKeys } from './useNotes';
import { reviewKeys } from './useReview';

export function useToggleFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, requiresFollowUp }) =>
      blocksApi.toggleFollowUp(blockId, requiresFollowUp),
    onSuccess: (block) => {
      // Invalidar caches afectados
      qc.invalidateQueries({ queryKey: noteKeys.detail(block.note_id) });
      qc.invalidateQueries({ queryKey: reviewKeys.all });
    }
  });
}
```

### 4.3 Hook — `hooks/useReview.js`

```javascript
import { useQuery } from '@tanstack/react-query';
import { blocksApi } from '../api/endpoints';

export const reviewKeys = {
  all: ['review'],
  byHours: (hours) => ['review', hours]
};

export function useReview(hours = 24) {
  return useQuery({
    queryKey: reviewKeys.byHours(hours),
    queryFn: () => blocksApi.getReview(hours),
    staleTime: 30_000  // 30s - evita refetch innecesario al cambiar tabs
  });
}
```

### 4.4 Componente — toggle dentro del bloque

Agregar a cada componente de bloque (texto, imagen, callout, etc.) un ícono pequeño en la barra de acciones del bloque. Patrón sugerido: bandera (`Flag` de lucide-react), llena cuando está activo.

```jsx
// components/notes/blocks/BlockFollowUpToggle.jsx
import { Flag } from 'lucide-react';
import { useToggleFollowUp } from '../../../hooks/useBlockFollowUp';

export function BlockFollowUpToggle({ block }) {
  const { mutate, isPending } = useToggleFollowUp();
  const active = block.requires_follow_up;

  return (
    <button
      type="button"
      onClick={() => mutate({
        blockId: block.id,
        requiresFollowUp: !active
      })}
      disabled={isPending}
      className={`
        p-1 rounded transition-colors
        ${active
          ? 'text-amber-500 hover:text-amber-600'
          : 'text-gray-400 hover:text-gray-600'}
      `}
      title={active ? 'Resolver seguimiento' : 'Marcar para seguimiento'}
      aria-label={active ? 'Resolver seguimiento' : 'Marcar para seguimiento'}
    >
      <Flag size={16} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
```

Cuando el bloque tiene `requires_follow_up = true`, agregar un borde sutil al contenedor del bloque:

```jsx
<div className={`
  block-container
  ${block.requires_follow_up ? 'border-l-2 border-amber-400 pl-3' : ''}
`}>
```

### 4.5 Página — `pages/Review.jsx`

Estructura de la vista:

```jsx
export default function Review() {
  const [hours, setHours] = useState(24);
  const { data, isLoading } = useReview(hours);

  if (isLoading) return <Loading />;

  return (
    <Layout>
      <header>
        <h1>Revisión</h1>
      </header>

      {/* Sección 1: Pendientes (sin filtro de tiempo) */}
      <section>
        <h2>
          Pendientes de seguimiento
          <span className="badge">{data.pending.length}</span>
        </h2>
        {data.pending.length === 0 ? (
          <EmptyState message="No hay bloques en seguimiento" />
        ) : (
          <BlockList
            blocks={data.pending}
            showResolveButton
          />
        )}
      </section>

      {/* Sección 2: Actividad reciente */}
      <section>
        <div className="flex justify-between items-center">
          <h2>Actividad reciente</h2>
          <TimeRangeTabs value={hours} onChange={setHours} />
        </div>
        <BlockList blocks={data.recent} />
      </section>
    </Layout>
  );
}
```

### 4.6 Componente — `BlockList.jsx`

Renderiza cada bloque con:
- Preview del contenido (primeras 2-3 líneas)
- Breadcrumb de la nota padre
- Timestamp relativo (hace X horas/días)
- Botón "Resolver" si `showResolveButton = true` y el bloque tiene flag activo
- Click en el item → `navigate('/notes/:noteId?highlight=:blockId')`

### 4.7 Highlight del bloque al navegar

En el componente de la nota, leer query param `highlight`:

```jsx
useEffect(() => {
  const blockId = searchParams.get('highlight');
  if (!blockId) return;

  const el = document.getElementById(`block-${blockId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-pulse');
    const timer = setTimeout(() => {
      el.classList.remove('highlight-pulse');
    }, 2500);
    return () => clearTimeout(timer);
  }
}, [searchParams]);
```

CSS:

```css
@keyframes highlightPulse {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgb(251 191 36 / 0.2); }
}
.highlight-pulse {
  animation: highlightPulse 2.5s ease-in-out;
}
```

### 4.8 Navegación

Añadir entrada "Revisión" en `Header.jsx` o sidebar, idealmente con un badge mostrando el conteo de pendientes (consultable con un query liviano que solo cuente, o reutilizando `useReview` con `select` para extraer solo el length).

---

## 5. Consideraciones de performance

1. **Índice parcial**: el índice solo abarca bloques con flag activo, manteniéndolo pequeño aunque la tabla crezca a millones de filas.
2. **Queries en paralelo**: `getReviewData` ejecuta pendientes y recientes con `Promise.all`, no secuencialmente.
3. **LIMIT en actividad reciente**: techo de 200 bloques previene degradación con usuarios muy activos.
4. **staleTime en React Query**: 30s evita refetches inmediatos al cambiar entre tabs de tiempo.
5. **Invalidación selectiva**: el toggle invalida solo la nota afectada y la review, no todo el árbol de notas.
6. **No hay JOIN innecesario**: solo se trae `note_title` y `parent_id`, no la nota completa.

Estimado: la query de pendientes en una base con 100k bloques y 1k usuarios debería retornar en < 5 ms gracias al índice parcial scopado por `user_id`.

---

## 6. Plan de testing

### Backend

- `setFollowUp` actualiza el flag y respeta `user_id` (no permite tocar bloques ajenos)
- `findPendingFollowUp` devuelve solo bloques con flag activo, no eliminados, y de notas no eliminadas
- `findPendingFollowUp` ordena ASC por `updated_at`
- `findRecentActivity` respeta el rango temporal y el LIMIT
- Endpoint `PATCH /blocks/:id/follow-up` retorna 404 para bloques inexistentes
- Endpoint `GET /blocks/review?hours=X` valida el parámetro

### Frontend

- Toggle dispara mutation y refleja estado al volver
- Borde ámbar aparece cuando `requires_follow_up = true`
- Vista de revisión muestra ambas secciones con datos correctos
- Click en item navega y resalta el bloque destino
- Botón "Resolver" en pendientes desmarca y saca el item de la lista

---

## 7. Pasos de despliegue

1. Ejecutar `migration_block_follow_up.sql` en producción.
2. Actualizar `schema.sql` para que entornos nuevos arranquen con la columna.
3. Desplegar backend (compatible hacia atrás: la columna tiene default `false`, los clientes viejos siguen funcionando).
4. Desplegar frontend.
5. No requiere backfill de datos: todos los bloques existentes quedan con flag `false`, lo cual es el estado correcto.

---

## 8. Decisiones tomadas durante el diseño

- **Manual sobre automático**: el usuario decide cuándo activar y resolver, ninguna heurística automática lo desmarca.
- **Sin columna `follow_up_marked_at`**: se reutiliza `updated_at` existente. Si en uso real se detecta que ediciones menores "ensucian" el orden, se añade después con migración trivial.
- **Ordenamiento ASC en pendientes**: los más antiguos sin resolver suben arriba, que es la señal accionable.
- **Vista única de Revisión, no widget en cada nota**: centraliza el flujo de revisión periódica que es el caso de uso real.
- **Sin sistema de tags por bloque**: descartado por fricción de uso y duplicación con tags de notas.

---

## 9. Posibles extensiones futuras

- Conteo de pendientes en el header como badge persistente.
- Filtro por tipo de bloque dentro de la vista de revisión.
- Exportar bloques pendientes como JSON (alimenta el caso de uso de IA).
- Agrupación por nota padre en la vista de pendientes.
- Métrica: tiempo promedio entre activar y resolver, como señal de productividad.