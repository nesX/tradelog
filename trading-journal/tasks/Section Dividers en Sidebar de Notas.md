# Section Dividers en Sidebar de Notas — Guía de Implementación

## Decisiones de diseño confirmadas

- **Modelado posicional (estilo TradingView):** las secciones son **divisores planos** a nivel raíz, no contenedores jerárquicos. La pertenencia de una nota a una sección se computa al renderizar, según la posición: una nota pertenece a la última sección que la precede en el orden raíz.
- **Todas las notas y secciones viven en el nivel raíz** del árbol cuando se trata de la "membresía a sección". El anidamiento de notas dentro de notas (sub-notas) sigue funcionando como antes — vive en otra "dimensión" del modelo.
- **Borrado de sección = borrar el divisor.** Las notas no se tocan, simplemente quedan agrupadas en la sección anterior (o sueltas si no hay anterior).
- **Crear/mover notas a una sección = cambiar `position`.** No hay operación estructural especial. Drag & drop natural.
- **Constraint clave nuevo:** ninguna nota puede tener `parent_id` apuntando a una sección. Enforced con trigger en BD + service.
- **Colapso:** estado en `localStorage`, per-dispositivo.
- **Sin bloques en secciones:** las secciones no tienen contenido editable.

### Visualización del modelo

Sidebar visible:
```
📝 Nota suelta
─── ESTRATEGIAS ───
   📝 Breakouts
   📝 Reversiones
─── ANÁLISIS ───
   📝 Journal Enero
   📝 Lecciones
```

Datos en BD (todo plano a nivel raíz):
```
id=1  type=note     parent_id=NULL  position=0  title="Nota suelta"
id=2  type=section  parent_id=NULL  position=1  title="Estrategias"
id=3  type=note     parent_id=NULL  position=2  title="Breakouts"
id=4  type=note     parent_id=NULL  position=3  title="Reversiones"
id=5  type=section  parent_id=NULL  position=4  title="Análisis"
id=6  type=note     parent_id=NULL  position=5  title="Journal Enero"
id=7  type=note     parent_id=NULL  position=6  title="Lecciones"
```

Las secciones no son padres de nadie — son simplemente divisores que el frontend usa para agrupar visualmente.

---

## 1. Schema / Migración

### 1.1 Columna `type` y constraints estructurales

```sql
-- migrations/YYYYMMDD_add_note_sections.sql
BEGIN;

-- 1. Columna type
ALTER TABLE notes
  ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'note';

-- 2. Restringir valores
ALTER TABLE notes
  ADD CONSTRAINT notes_type_check
  CHECK (type IN ('note', 'section'));

-- 3. Secciones siempre a nivel raíz
ALTER TABLE notes
  ADD CONSTRAINT sections_only_at_root
  CHECK (type = 'note' OR parent_id IS NULL);

COMMIT;
```

### 1.2 Trigger: ninguna nota puede tener una sección como padre

Esta es una validación cross-row (mirar el `type` de otro registro), por eso un `CHECK` simple no alcanza. El trigger es la forma correcta.

```sql
-- migrations/YYYYMMDD_prevent_section_as_parent.sql
BEGIN;

CREATE OR REPLACE FUNCTION prevent_section_as_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM notes
      WHERE id = NEW.parent_id
        AND type = 'section'
    ) THEN
      RAISE EXCEPTION 'Una nota no puede tener una sección como padre (parent_id=%)', NEW.parent_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_no_section_parent
  BEFORE INSERT OR UPDATE OF parent_id ON notes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_section_as_parent();

COMMIT;
```

Notas:
- `BEFORE UPDATE OF parent_id` solo dispara cuando se modifica esa columna. Eficiente.
- Para producción multi-usuario, este trigger te protege ante bugs en service, migraciones futuras o tests que pasen por alto la validación.
- Costo: una query indexada (PK lookup) cuando se modifica `parent_id`. Despreciable.

### 1.3 Bloques en secciones: validación a nivel servicio

Sigue siendo a nivel servicio (no constraint de BD). Si `note.type = 'section'`, rechazar inserciones en `blocks`.

### 1.4 Sobre índices

No hace falta agregar índices. El que ya tenés (`user_id, parent_id, position`) sigue siendo el correcto para cargar el árbol.

---

## 2. Backend

### 2.1 Repository (`notes.repository.js`)

**Sin métodos nuevos.** El modelo posicional aprovecha toda la infraestructura existente.

`findTreeByUserId` no cambia — sigue devolviendo todas las notas del usuario, ahora también las secciones. El campo `type` viaja en el SELECT.

`softDelete` no cambia — borra una sola fila. No hay "promote children" que hacer.

### 2.2 Service (`notes.service.js`)

#### `createNote(data, userId)` — soportar type

```javascript
async function createNote(data, userId) {
  const { type = 'note', parentId = null, title } = data;

  // Regla: secciones solo a nivel raíz
  if (type === 'section' && parentId !== null) {
    throw new ValidationError('Las secciones solo pueden crearse a nivel raíz');
  }

  // Regla: una nota no puede tener una sección como padre
  if (type === 'note' && parentId !== null) {
    const parent = await notesRepository.findById(parentId, userId);
    if (!parent) {
      throw new ValidationError('Nota padre no encontrada');
    }
    if (parent.type === 'section') {
      throw new ValidationError('Una nota no puede tener una sección como padre');
    }
  }

  // Regla: secciones requieren nombre
  if (type === 'section' && (!title || title.trim() === '')) {
    throw new ValidationError('La sección debe tener un nombre');
  }

  return notesRepository.create({ ...data, type, parentId }, userId);
}
```

#### `deleteNote(id, userId)` — vuelve a ser simple

```javascript
async function deleteNote(id, userId) {
  const note = await notesRepository.findById(id, userId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  if (note.type === 'note') {
    // Soft-delete cascada como ya está implementado (incluye sub-notas)
    return notesRepository.softDeleteCascade(id, userId);
  }

  // Sección: borrar solo el divisor. Las notas que "pertenecían" a ella
  // quedan automáticamente bajo la sección anterior (o sueltas).
  return notesRepository.softDelete(id, userId);
}
```

Sin transacción, sin promoción de hijos. La belleza del modelo posicional.

#### `updateNote(id, data, userId)` — bloquear cambios estructurales

```javascript
async function updateNote(id, data, userId) {
  const note = await notesRepository.findById(id, userId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  // No se puede cambiar el type
  if (data.type !== undefined && data.type !== note.type) {
    throw new ValidationError('No se puede cambiar el tipo de una nota');
  }

  // Una sección no puede moverse fuera del raíz
  if (note.type === 'section' && data.parentId !== undefined && data.parentId !== null) {
    throw new ValidationError('Las secciones no pueden anidarse');
  }

  // Una nota no puede tener una sección como padre
  if (note.type === 'note' && data.parentId !== undefined && data.parentId !== null) {
    const parent = await notesRepository.findById(data.parentId, userId);
    if (parent?.type === 'section') {
      throw new ValidationError('Una nota no puede tener una sección como padre');
    }
  }

  return notesRepository.update(id, data, userId);
}
```

#### `moveNote(id, newParentId, newPosition, userId)`

Si tenés un método dedicado para drag & drop, aplicá las mismas reglas:
- Secciones: rechazar si `newParentId !== null`.
- Notas: rechazar si `newParentId` apunta a una sección.

(El trigger de BD te cubre como segunda línea de defensa, pero es mejor fallar temprano con un error de dominio claro.)

#### Service de blocks — bloquear bloques en secciones

```javascript
// blocks.service.js
async function addBlock(noteId, blockData, userId) {
  const note = await notesRepository.findById(noteId, userId);
  if (!note) throw new NotFoundError('Nota no encontrada');

  if (note.type === 'section') {
    throw new ValidationError('Las secciones no pueden tener bloques');
  }

  return blocksRepository.create(noteId, blockData);
}
```

### 2.3 Validators (Joi) — `notes.validator.js`

```javascript
import Joi from 'joi';

export const createNoteSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  parentId: Joi.number().integer().positive().allow(null).default(null),
  position: Joi.number().integer().min(0).optional(),
  type: Joi.string().valid('note', 'section').default('note'),
}).custom((value, helpers) => {
  if (value.type === 'section' && value.parentId !== null) {
    return helpers.error('any.invalid', {
      message: 'Las secciones solo pueden crearse a nivel raíz',
    });
  }
  return value;
});

export const updateNoteSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional(),
  parentId: Joi.number().integer().positive().allow(null).optional(),
  position: Joi.number().integer().min(0).optional(),
  // type NO está acá — no se permite cambiar
});
```

La validación cross-field "parent_id no puede apuntar a una sección" no se puede hacer en Joi (necesita query a BD). Vive en service + trigger.

### 2.4 Controller / Routes

Sin cambios. El frontend manda `type: 'section'` al `POST /api/notes` existente. El controller pasa el body al service como siempre.

---

## 3. Frontend

### 3.1 La función clave: `groupBySections`

Esta es la pieza central. Convierte la lista plana del nivel raíz en una estructura agrupada para renderizar.

```javascript
// utils/notesGrouping.js

/**
 * Agrupa los nodos de nivel raíz por proximidad a las secciones.
 * Una nota pertenece a la última sección que la precede.
 * Las notas anteriores a la primera sección quedan en un grupo con section=null.
 *
 * @param {Array<Note>} rootNodes - Notas y secciones del nivel raíz, ordenadas por position
 * @returns {Array<{ section: Note|null, items: Array<Note> }>}
 */
export function groupBySections(rootNodes) {
  const groups = [];
  let current = { section: null, items: [] };

  for (const node of rootNodes) {
    if (node.type === 'section') {
      // Cerrar el grupo actual y abrir uno nuevo
      groups.push(current);
      current = { section: node, items: [] };
    } else {
      current.items.push(node);
    }
  }

  groups.push(current);
  return groups;
}
```

El primer grupo puede tener `section: null` (notas antes de cualquier sección, o todas las notas si no hay secciones).

### 3.2 `SectionDivider.jsx` (`components/notes/sidebar/`)

```jsx
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSectionCollapsed } from '../../../hooks/useSectionCollapsed';

export function SectionDivider({ section, children, onRename, onDelete }) {
  const [collapsed, toggle] = useSectionCollapsed(section.id);

  return (
    <div className="section-divider">
      <div
        className="section-header flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-wide text-gray-500 hover:bg-gray-50 rounded cursor-pointer group"
        onClick={toggle}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span className="flex-1 truncate">{section.title}</span>
        <SectionMenu section={section} onRename={onRename} onDelete={onDelete} />
      </div>
      {!collapsed && (
        <div className="section-children">
          {children}
        </div>
      )}
    </div>
  );
}
```

Visual sugerido (parecido a TradingView):
- Texto en mayúsculas, color tenue.
- Sin background fuerte para no competir con notas seleccionadas.
- Chevron a la izquierda, menú (3 puntos) a la derecha visible solo en hover.
- Indentación leve de los hijos para diferenciar visualmente del nivel raíz suelto (puramente visual — los datos no están anidados).

### 3.3 `useSectionCollapsed.js` (`hooks/`)

```javascript
import { useState, useCallback } from 'react';

const KEY_PREFIX = 'notes:section:collapsed:';

export function useSectionCollapsed(sectionId) {
  const storageKey = `${KEY_PREFIX}${sectionId}`;

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle];
}

// Helper para limpiar el estado al borrar una sección
export function clearSectionCollapsed(sectionId) {
  try {
    localStorage.removeItem(`${KEY_PREFIX}${sectionId}`);
  } catch {
    /* ignore */
  }
}
```

Llamá a `clearSectionCollapsed(sectionId)` en el `onSuccess` de la mutation de delete para no acumular basura.

### 3.4 `NotesSidebar.jsx` — render con grupos

```jsx
import { groupBySections } from '../../utils/notesGrouping';

export function NotesSidebar() {
  const { data: tree } = useNotesTree();

  // Solo nivel raíz para agrupamiento. Las sub-notas (notas con parent_id != null)
  // se renderizan dentro de cada NoteItem como antes.
  const rootNodes = tree?.filter((n) => n.parentId === null) ?? [];
  const groups = groupBySections(rootNodes);

  return (
    <aside className="notes-sidebar">
      <SidebarHeader />
      {groups.map((group, idx) => (
        <SectionGroup key={group.section?.id ?? `ungrouped-${idx}`} group={group} />
      ))}
    </aside>
  );
}

function SectionGroup({ group }) {
  // Notas antes de la primera sección, o todas si no hay secciones
  if (group.section === null) {
    if (group.items.length === 0) return null;
    return (
      <div className="ungrouped-notes">
        {group.items.map((item) => <NoteItem key={item.id} note={item} />)}
      </div>
    );
  }

  return (
    <SectionDivider
      section={group.section}
      onRename={handleRenameSection}
      onDelete={handleDeleteSection}
    >
      {group.items.map((item) => <NoteItem key={item.id} note={item} />)}
    </SectionDivider>
  );
}
```

`NoteItem` no necesita cambios — sigue renderizando la nota y sus sub-notas (las que tienen `parent_id` apuntando a esta nota) como antes.

### 3.5 Botón "Nueva sección"

Dropdown unificado en la barra superior del sidebar:

```jsx
<DropdownMenu>
  <DropdownMenu.Trigger>
    <Plus size={16} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item onClick={createNote}>
      <FileText size={14} /> Nueva nota
    </DropdownMenu.Item>
    <DropdownMenu.Item onClick={createSection}>
      <Folder size={14} /> Nueva sección
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu>
```

Al click en "Nueva sección", input inline (no modal) en el sidebar. Foco automático, Enter confirma, Escape cancela.

#### ¿Dónde se inserta una nota nueva?

En el modelo posicional, **al final del nivel raíz** = al final de la última sección abierta. Es lo que el usuario espera:

```
─── ESTRATEGIAS ───
   📝 Breakouts
─── ANÁLISIS ───
   📝 Lecciones
   📝 (nueva nota)   ← aparece acá
```

Para "Nueva sección" lo mismo: aparece al final, debajo de todo. El usuario después la arrastra a su lugar si quiere.

Mejora futura (no incluida en este MVP): detectar la nota actualmente seleccionada y crear la nueva nota inmediatamente debajo (en el mismo grupo).

### 3.6 Hook `useNotes` — soportar type en mutation

```javascript
export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, parentId = null, type = 'note' }) =>
      api.post('/notes', { title, parentId, type }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries(['notes', 'tree']),
  });
}

// Helper opcional para semántica clara
export function useCreateSection() {
  const create = useCreateNote();
  return (title) => create.mutate({ title, type: 'section', parentId: null });
}
```

### 3.7 Drag & drop — reglas

| Item arrastrado | Destino | Permitido | Operación |
|---|---|---|---|
| Nota | Slot del nivel raíz (entre items) | ✅ | Cambia `position`, `parent_id = NULL` |
| Nota | Dentro de otra nota (anidamiento) | ✅ | Cambia `parent_id` a esa nota |
| Sección | Slot del nivel raíz | ✅ | Cambia `position`, `parent_id = NULL` |
| Sección | Dentro de cualquier cosa | ❌ | Rechazar |
| Cualquier cosa | Sobre header de sección colapsada | (UX) | Auto-expandir, o rechazar |

```javascript
function canDrop(dragged, target) {
  if (dragged.type === 'section') {
    return target.kind === 'root-slot';
  }
  if (dragged.type === 'note' && target.kind === 'inside-note') {
    return target.note.type !== 'section';
  }
  return true;
}
```

#### El comportamiento sutil del modelo posicional

Como las membresías son posicionales, **mover una sección puede cambiar implícitamente qué notas le pertenecen**. Si arrastrás "ESTRATEGIAS" hacia abajo dos posiciones, las dos notas que ahora quedan debajo pasan a ser sus "miembros" visualmente.

En TradingView esto se siente intuitivo: cuando arrastrás una sección, mové el "encabezado" donde está. Las notas no se mueven con la sección — la sección se inserta entre ellas.

Si más adelante querés el comportamiento opuesto ("mover sección + miembros como bloque"), se puede implementar en frontend con varias mutations o un endpoint batch. Pero TradingView no lo hace y agrega complejidad significativa.

### 3.8 Confirmación de borrado de sección

```
¿Eliminar la sección "Estrategias"?

Las 3 notas que estaban agrupadas bajo esta sección
quedarán bajo la sección anterior (o sueltas si no hay).

Las notas no se borran.

[Cancelar]  [Eliminar sección]
```

Importante explicarlo bien — los usuarios suelen asumir cascade y dudan en borrar.

---

## 4. Edge cases y validaciones

| Caso | Comportamiento |
|---|---|
| Crear sección con título vacío | Rechazar en validator (`min(1)`) |
| Crear sección con `parentId != null` | Rechazar en validator y service |
| Editar nota y mandar `type` distinto | Rechazar en service |
| Mover sección dentro de otra cosa | Rechazar en service |
| Crear/mover nota con `parent_id` apuntando a sección | Rechazar en service + trigger BD |
| Agregar bloque a una sección | Rechazar en blocks service |
| Borrar sección | Soft-delete simple, las notas no se tocan |
| Borrar la única sección que existía | Las notas que estaban "bajo" ella quedan en el grupo `ungrouped` |
| Borrar una sub-nota de una nota que está bajo una sección | Sin cambios — las secciones son ortogonales al anidamiento de notas |
| Sección con id que ya no existe en localStorage | `useSectionCollapsed` no falla, default `false` |
| Renderizar cero notas y cero secciones | Estado vacío, sin grupos |
| Renderizar solo notas, ninguna sección | Un solo grupo `{ section: null, items: [...] }` |
| Mover sección y cambiar implícitamente sus miembros | Comportamiento esperado del modelo posicional |

---

## 5. Orden de implementación sugerido

Cada paso es deployable independientemente — no rompe lo existente.

1. **Migración SQL** (columna `type` + constraints + trigger). Verificar que las notas existentes siguen funcionando (todas pasan a `type='note'`).
2. **Backend service + validator** — sin tocar frontend. Probar con curl/Postman: crear sección, crear nota, intentar crear nota con sección como padre (debe fallar), borrar sección.
3. **Frontend: render con grupos** — `groupBySections` + `SectionDivider` + bifurcación en sidebar. En este punto las secciones ya se ven aunque no se puedan crear desde la UI (insertás una manualmente con SQL para probar).
4. **Frontend: creación** — dropdown + input inline + mutation.
5. **Frontend: colapso** — hook + persistencia en localStorage.
6. **Frontend: borrado** — confirm dialog + cleanup de localStorage.
7. **Frontend: rename** — reutilizar el flujo existente de renombrar nota.
8. **Drag & drop** — agregar validaciones, dejar último porque es lo más frágil.

---

## 6. Lo que NO incluye este diseño (para fase 2)

- Iconos/colores personalizables por sección.
- Secciones anidadas.
- Sincronización del estado de colapso entre dispositivos.
- Detectar la sección actual al crear una nota nueva (insertarla en ese grupo en vez de al final).
- Drag & drop de "sección + miembros" como bloque.
- Atajos de teclado.

Cualquiera de estos se puede agregar después sin tocar el modelo de datos.