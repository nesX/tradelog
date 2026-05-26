# Task: Filtros temporales en sección "Pendientes de seguimiento"

## Contexto

La página de Revisión ya tiene implementado el sistema de seguimiento de bloques con dos secciones:
- **Pendientes de seguimiento**: bloques con `requires_follow_up = true`, ordenados por `updated_at ASC` (más antiguos primero).
- **Actividad reciente**: tabs de 24h / 48h / 1 semana sobre todos los bloques.

Esta task agrega filtros temporales a la sección de **Pendientes**, equivalentes a los de Actividad reciente pero aplicados solo sobre bloques en seguimiento.

## Objetivo

Permitir filtrar la lista de pendientes por ventana temporal (24h / 48h / 1 semana / Todos) usando `updated_at` como referencia, manteniendo el orden ascendente actual dentro del rango seleccionado.

**Caso de uso principal**: al final del día revisar qué movimientos quedaron pendientes de cerrar dentro de un rango de tiempo manejable.

## Decisiones de diseño

- **Campo de filtro**: `updated_at` (mismo criterio que Actividad reciente, consistente con la lógica ya implementada).
- **Orden**: se preserva ASC (más antiguos primero) dentro del rango.
- **Default**: "Todos" — mantiene el comportamiento actual y no rompe expectativas del usuario.
- **Valores permitidos**: 24, 48, 168 (1 semana) y `null` para "Todos".
- **Independencia entre secciones**: el filtro de Pendientes y el de Actividad reciente son independientes (cada uno mantiene su propio estado).

---

## Cambios en Backend

### 1. Repository — `note-block.repository.js`

Modificar `findPendingFollowUp` para aceptar un parámetro opcional `hoursBack`:

```javascript
/**
 * Obtiene bloques en seguimiento del usuario.
 * @param {number} userId
 * @param {number|null} hoursBack - si se provee, filtra por updated_at dentro del rango
 * @returns {Promise<Array>}
 */
async function findPendingFollowUp(userId, hoursBack = null) {
  const params = [userId];
  let timeFilter = '';

  if (hoursBack !== null) {
    params.push(hoursBack);
    timeFilter = `AND b.updated_at >= NOW() - ($${params.length} || ' hours')::INTERVAL`;
  }

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
      ${timeFilter}
    ORDER BY b.updated_at ASC
  `;
  const result = await db.query(query, params);
  return result.rows;
}
```

> **Nota:** ajustar el nombre de la tabla y los campos según el código real del proyecto.

### 2. Service — `note-block.service.js`

Modificar `getReviewData` para aceptar el parámetro independiente de pendientes:

```javascript
/**
 * @param {number} userId
 * @param {number} recentHours - ventana de Actividad reciente (24/48/168)
 * @param {number|null} pendingHours - ventana de Pendientes (24/48/168 o null = todos)
 */
async function getReviewData(userId, recentHours = 24, pendingHours = null) {
  const [pending, recent] = await Promise.all([
    noteBlockRepository.findPendingFollowUp(userId, pendingHours),
    noteBlockRepository.findRecentActivity(userId, recentHours)
  ]);

  return {
    pending,
    recent,
    recentHours,
    pendingHours
  };
}
```

### 3. Controller — `note-block.controller.js`

Aceptar y validar el nuevo query param `pendingHours`:

```javascript
async function getReview(req, res, next) {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const allowedHours = [24, 48, 168];
    if (!allowedHours.includes(hours)) {
      throw new ValidationError('hours debe ser 24, 48 o 168');
    }

    // pendingHours opcional: si no viene o es 'all', se trata como null
    let pendingHours = null;
    if (req.query.pendingHours && req.query.pendingHours !== 'all') {
      pendingHours = parseInt(req.query.pendingHours, 10);
      if (!allowedHours.includes(pendingHours)) {
        throw new ValidationError('pendingHours debe ser 24, 48, 168 o "all"');
      }
    }

    const data = await noteBlockService.getReviewData(
      req.user.id,
      hours,
      pendingHours
    );
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
}
```

> No es necesario modificar rutas ni validadores Joi (el query param es opcional y se valida en el controller).

---

## Cambios en Frontend

### 1. Endpoints — `api/endpoints.js`

Modificar `getReview` para aceptar el nuevo parámetro:

```javascript
getReview: (hours = 24, pendingHours = null) =>
  client.get('/blocks/review', {
    params: {
      hours,
      ...(pendingHours !== null && { pendingHours })
    }
  })
```

### 2. Hook — `hooks/useReview.js`

Extender el hook y la cache key:

```javascript
export const reviewKeys = {
  all: ['review'],
  byParams: (hours, pendingHours) => ['review', hours, pendingHours]
};

export function useReview(hours = 24, pendingHours = null) {
  return useQuery({
    queryKey: reviewKeys.byParams(hours, pendingHours),
    queryFn: () => blocksApi.getReview(hours, pendingHours),
    staleTime: 30_000
  });
}
```

> **Importante:** verificar que `useToggleFollowUp` siga invalidando `reviewKeys.all` para que el toggle refresque todas las combinaciones de filtros en cache.

### 3. Página — `pages/Review.jsx`

Agregar estado independiente para el filtro de pendientes:

```jsx
const [recentHours, setRecentHours] = useState(24);
const [pendingHours, setPendingHours] = useState(null); // null = "Todos"
const { data, isLoading } = useReview(recentHours, pendingHours);
```

En la sección de Pendientes, añadir los tabs reutilizando el componente `TimeRangeTabs` con una opción adicional "Todos":

```jsx
<section>
  <div className="flex justify-between items-center">
    <h2>
      Pendientes de seguimiento
      <span className="badge">{data.pending.length}</span>
    </h2>
    <TimeRangeTabs
      value={pendingHours}
      onChange={setPendingHours}
      includeAll
    />
  </div>
  {data.pending.length === 0 ? (
    <EmptyState message={
      pendingHours === null
        ? 'No hay bloques en seguimiento'
        : 'No hay pendientes en este rango'
    } />
  ) : (
    <BlockList blocks={data.pending} showResolveButton />
  )}
</section>
```

### 4. Componente — `TimeRangeTabs`

Extender el componente existente para soportar la opción "Todos":

```jsx
export function TimeRangeTabs({ value, onChange, includeAll = false }) {
  const options = [
    ...(includeAll ? [{ label: 'Todos', value: null }] : []),
    { label: '24 h', value: 24 },
    { label: '48 h', value: 48 },
    { label: '1 semana', value: 168 }
  ];

  return (
    <div className="inline-flex rounded-md border border-gray-700">
      {options.map(opt => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.value)}
          className={`
            px-3 py-1 text-sm transition-colors
            ${value === opt.value
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-800'}
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

---

## Criterios de aceptación

- [ ] El filtro temporal de Pendientes funciona de forma independiente del de Actividad reciente.
- [ ] La opción "Todos" es el valor por defecto al entrar a la página.
- [ ] Al seleccionar 24h/48h/1 semana, los bloques se filtran por `updated_at` dentro del rango.
- [ ] El orden ascendente (más antiguos primero) se mantiene dentro del rango filtrado.
- [ ] El badge con el conteo refleja la cantidad de bloques visibles tras aplicar el filtro.
- [ ] El estado vacío diferencia entre "no hay pendientes" y "no hay pendientes en este rango".
- [ ] Al resolver un bloque, la lista se actualiza correctamente con el filtro activo.
- [ ] Cambiar el filtro no hace refetch innecesario gracias al `staleTime` de React Query.
- [ ] Endpoint rechaza valores inválidos de `pendingHours` con 400.

---

## Testing manual sugerido

1. Marcar varios bloques como pendientes con distintos tiempos de actualización (uno de hoy, uno de hace 2 días, uno de hace 1 mes).
2. Con filtro "Todos" debe ver todos.
3. Con filtro "24h" debe ver solo el de hoy.
4. Con filtro "48h" debe ver el de hoy y el de hace 2 días.
5. Con filtro "1 semana" debe ver los dos primeros, no el de hace un mes.
6. Resolver el bloque más antiguo dentro del filtro activo → la lista se actualiza sin recargar.
7. El filtro de Actividad reciente no debe afectar al de Pendientes ni viceversa.

---

## Notas de performance

- El índice parcial existente `idx_note_blocks_follow_up (user_id, updated_at ASC) WHERE requires_follow_up = true` ya cubre la query nueva sin cambios.
- El filtro temporal usa la misma columna (`updated_at`) que ya está en el índice, así que el filtro adicional no degrada el plan de consulta.
- No requiere migración ni cambios de esquema.