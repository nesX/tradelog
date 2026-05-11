# Implementación: Sistema de Referencias (Notas y Bloques)

## Resumen ejecutivo

Renombramos el tipo de bloque `note_link` → `reference` y ampliamos su semántica para soportar referencias tanto a notas completas como a bloques específicos. El usuario crea una referencia copiando una URL pública desde el bloque destino (o desde la nota destino) y pegándola en un bloque `reference`, donde también escribe un label libre. El render es 100% local (sin queries adicionales, sin verificación de existencia, sin preview). El click abre la URL en una pestaña nueva.

## Decisiones de diseño confirmadas

1. **Un solo tipo de bloque**: `reference` (renombrado desde `note_link`).
2. **Formato del link**: URL pública navegable. `https://app.com/notes/{noteId}` para nota completa, `https://app.com/notes/{noteId}#block-{blockId}` para bloque específico.
3. **Sin verificación al renderizar**: el bloque guarda solo el label y los IDs parseados; no se hacen queries a la nota/bloque destino al cargar la nota actual.
4. **Comportamiento de enlaces rotos**: si el destino ya no existe, el usuario lo descubre al hacer click (la página destino mostrará "no encontrado"). Sin estado `is_broken` en el render.
5. **Apertura**: target `_blank` (pestaña nueva).
6. **UI de creación**: nuevo botón "Copiar referencia" en hover, junto a los tres existentes (drag, bandera, eliminar).
7. **Parser**: al pegar la URL en el bloque, se extraen `noteId` y opcionalmente `blockId` mediante regex.

---

## 1. Cambios en backend

### 1.1 Modelo de datos

**No hay migración de schema.** El tipo de bloque y la metadata viven en columnas existentes:
- `blocks.type` (varchar) → cambia el valor `note_link` por `reference`.
- `blocks.metadata` (JSONB) → estructura nueva, retrocompatible.

**Estructura nueva del metadata para bloque tipo `reference`:**

```json
{
  "target_note_id": "uuid-de-la-nota-destino",
  "target_block_id": "uuid-del-bloque-destino-o-null",
  "label": "Texto que el usuario escribió"
}
```

`target_block_id` es `null` cuando la referencia apunta a una nota completa.

### 1.2 Migración de datos existentes

Migración SQL única para renombrar el tipo de bloques existentes:

```sql
-- migration_block_references.sql
BEGIN;

UPDATE blocks
SET type = 'reference'
WHERE type = 'note_link';

-- Los metadata existentes (que apuntan a notas) ya son compatibles
-- con la nueva estructura porque target_block_id es opcional.
-- Solo aseguramos que el campo label exista (puede haber bloques antiguos sin él).
UPDATE blocks
SET metadata = jsonb_set(
  metadata,
  '{label}',
  COALESCE(metadata->'label', '"Referencia"'::jsonb),
  true
)
WHERE type = 'reference' AND metadata->>'label' IS NULL;

COMMIT;
```

Validación post-migración:

```sql
-- Debería retornar 0
SELECT COUNT(*) FROM blocks WHERE type = 'note_link';

-- Inspección de los nuevos reference blocks
SELECT id, metadata FROM blocks WHERE type = 'reference' LIMIT 5;
```

### 1.3 Constantes del modelo

En el archivo donde tengas la enumeración de tipos de bloque (probablemente `block.model.js` o similar):

```js
export const BLOCK_TYPES = {
  TEXT: 'text',
  IMAGE_GALLERY: 'image_gallery',
  REFERENCE: 'reference',     // antes: NOTE_LINK
  CALLOUT: 'callout',
  // futuros: DIVIDER, BOOKMARK, TOGGLE
};
```

### 1.4 Validador (Joi)

Actualiza el schema del bloque `reference`. El cambio clave: `target_block_id` es opcional pero, si está presente, debe ser un UUID válido.

```js
// validators/block.validator.js
import Joi from 'joi';

const referenceMetadataSchema = Joi.object({
  target_note_id: Joi.string().uuid().required(),
  target_block_id: Joi.string().uuid().allow(null).optional(),
  label: Joi.string().trim().min(1).max(200).required(),
});

// En el schema general del bloque, branchea por type:
const blockSchema = Joi.object({
  type: Joi.string().valid(...Object.values(BLOCK_TYPES)).required(),
  content: Joi.string().allow('').optional(),
  metadata: Joi.when('type', {
    is: BLOCK_TYPES.REFERENCE,
    then: referenceMetadataSchema,
    otherwise: Joi.object().optional(),
  }),
  // ... resto de campos del bloque
});
```

### 1.5 Capa de service

No requiere cambios funcionales en `block.service.js` ni en `note.service.js`. El bloque `reference` se crea, actualiza y elimina con los mismos métodos genéricos que cualquier otro bloque. La validación del metadata la hace el validador antes de llegar al service.

**Una sola excepción posible** que sí merece tocar en el service: el endpoint que recibe la URL pegada por el usuario podría hacer el parseo en backend en lugar de frontend. Pero como el parser es regex puro y no toca DB, **es mejor parsearlo en frontend** (menos latencia, mejor feedback inmediato al usuario). Mantén el backend ignorante: solo recibe `target_note_id`, `target_block_id?`, y `label` ya parseados.

### 1.6 Repositorio

Sin cambios. El repositorio sigue siendo agnóstico al tipo de bloque; recibe el JSONB y lo guarda.

### 1.7 Rendimiento

Cero impacto. Las queries de carga de nota (`SELECT * FROM blocks WHERE note_id = $1 ORDER BY position`) no cambian y no agregan JOINs. Cada bloque `reference` es exactamente tan caro de leer como un bloque `text`.

---

## 2. Cambios en frontend

### 2.1 Utilidad de parseo y generación de URLs

Crea un archivo dedicado para mantener este código aislado y testeable:

```js
// utils/referenceLinks.js

const BASE_URL = window.location.origin;

/**
 * Genera la URL pública de una nota completa.
 */
export function buildNoteUrl(noteId) {
  return `${BASE_URL}/notes/${noteId}`;
}

/**
 * Genera la URL pública de un bloque específico dentro de una nota.
 */
export function buildBlockUrl(noteId, blockId) {
  return `${BASE_URL}/notes/${noteId}#block-${blockId}`;
}

/**
 * Parsea una URL pegada y extrae los IDs.
 * Retorna { noteId, blockId } o null si el formato es inválido.
 *
 * Acepta:
 *   - https://dominio.com/notes/{uuid}
 *   - https://dominio.com/notes/{uuid}#block-{uuid}
 *   - /notes/{uuid} (path relativo)
 *   - /notes/{uuid}#block-{uuid}
 */
export function parseReferenceUrl(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Regex permisivo: acepta URL completa o path relativo.
  // Captura uuid de nota y opcionalmente uuid de bloque.
  const regex = /\/notes\/([0-9a-f-]{36})(?:#block-([0-9a-f-]{36}))?/i;
  const match = trimmed.match(regex);

  if (!match) return null;

  return {
    noteId: match[1],
    blockId: match[2] || null,
  };
}
```

**Por qué este enfoque del regex:**
- Acepta tanto URLs absolutas como relativas, lo que es robusto si el dominio cambia o si el usuario copia desde dev/staging.
- Solo valida el formato UUID, no la existencia. La existencia se descubre al hacer click (consistente con tu decisión).
- Es puro y sin side effects, fácil de testear.

### 2.2 Componente: botón "Copiar referencia"

Añádelo al grupo de iconos de hover del bloque (junto a drag, bandera y eliminar):

```jsx
// components/notes/BlockActions.jsx (o donde tengas los botones de hover del bloque)
import { Link2 } from 'lucide-react';
import { buildBlockUrl } from '@/utils/referenceLinks';
import { useToast } from '@/components/common/Toast';

function CopyReferenceButton({ noteId, blockId }) {
  const toast = useToast();

  const handleCopy = async () => {
    try {
      const url = buildBlockUrl(noteId, blockId);
      await navigator.clipboard.writeText(url);
      toast.success('Referencia copiada');
    } catch (err) {
      toast.error('No se pudo copiar la referencia');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="block-action-btn"
      title="Copiar referencia al bloque"
      aria-label="Copiar referencia al bloque"
    >
      <Link2 size={14} />
    </button>
  );
}
```

Para copiar una referencia a la **nota completa** (no a un bloque), pon el mismo botón en el header de la nota, llamando a `buildNoteUrl(noteId)` en lugar de `buildBlockUrl(noteId, blockId)`. Reutiliza el componente con una prop.

### 2.3 Componente: bloque `reference` (editor mode)

Cuando el usuario crea un bloque tipo `reference` y aún no ha pegado nada, muestra un input para pegar el link y otro para el label:

```jsx
// components/notes/blocks/ReferenceBlock.jsx
import { useState } from 'react';
import { Link2, AlertCircle } from 'lucide-react';
import { parseReferenceUrl, buildNoteUrl, buildBlockUrl } from '@/utils/referenceLinks';

export function ReferenceBlockEditor({ block, onChange }) {
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState(null);

  const { target_note_id, target_block_id, label } = block.metadata || {};
  const isConfigured = Boolean(target_note_id);

  const handleUrlPaste = (value) => {
    setUrlInput(value);
    setError(null);

    if (!value.trim()) return;

    const parsed = parseReferenceUrl(value);
    if (!parsed) {
      setError('URL no válida. Pega un enlace de nota o bloque.');
      return;
    }

    onChange({
      ...block,
      metadata: {
        target_note_id: parsed.noteId,
        target_block_id: parsed.blockId,
        label: label || 'Referencia',
      },
    });
    setUrlInput('');
  };

  const handleLabelChange = (newLabel) => {
    onChange({
      ...block,
      metadata: {
        ...block.metadata,
        label: newLabel,
      },
    });
  };

  if (!isConfigured) {
    return (
      <div className="reference-block-empty">
        <input
          type="text"
          placeholder="Pega la URL de la nota o bloque…"
          value={urlInput}
          onChange={(e) => handleUrlPaste(e.target.value)}
          onPaste={(e) => {
            // El onChange ya lo captura, pero dejamos un hook por si quieres lógica extra
          }}
          className="reference-url-input"
        />
        {error && (
          <div className="reference-error">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>
    );
  }

  const href = target_block_id
    ? buildBlockUrl(target_note_id, target_block_id)
    : buildNoteUrl(target_note_id);

  return (
    <div className="reference-block-configured">
      <Link2 size={14} className="reference-icon" />
      <input
        type="text"
        value={label || ''}
        onChange={(e) => handleLabelChange(e.target.value)}
        placeholder="Etiqueta de la referencia"
        className="reference-label-input"
      />
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="reference-open-link"
        title="Abrir en pestaña nueva"
      >
        Abrir →
      </a>
    </div>
  );
}
```

### 2.4 Componente: bloque `reference` (read mode)

El render en modo lectura es trivial:

```jsx
// components/notes/blocks/ReferenceBlockView.jsx
import { Link2 } from 'lucide-react';
import { buildNoteUrl, buildBlockUrl } from '@/utils/referenceLinks';

export function ReferenceBlockView({ block }) {
  const { target_note_id, target_block_id, label } = block.metadata || {};

  if (!target_note_id) return null; // bloque sin configurar

  const href = target_block_id
    ? buildBlockUrl(target_note_id, target_block_id)
    : buildNoteUrl(target_note_id);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="reference-block-link"
    >
      <Link2 size={14} />
      <span>{label || 'Referencia'}</span>
    </a>
  );
}
```

### 2.5 Scroll-to-block al llegar vía URL con anchor

Cuando el usuario hace click en una referencia tipo `#block-{id}`, llega a la nota destino con un hash en la URL. Tu router debe manejarlo. Añade este hook en la página de detalle de nota:

```jsx
// pages/NoteDetail.jsx (o donde renderices una nota completa)
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function useScrollToBlockFromHash(isLoaded) {
  const location = useLocation();

  useEffect(() => {
    if (!isLoaded) return;

    const hash = location.hash; // "#block-{uuid}"
    if (!hash || !hash.startsWith('#block-')) return;

    const blockId = hash.replace('#block-', '');
    // Espera un tick para asegurar que el DOM esté pintado
    requestAnimationFrame(() => {
      const el = document.getElementById(`block-${blockId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('block-highlight');
        setTimeout(() => el.classList.remove('block-highlight'), 2000);
      }
    });
  }, [location.hash, isLoaded]);
}
```

**Importante:** asegúrate de que cada bloque renderizado tenga el atributo `id={`block-${block.id}`}` en su contenedor raíz. Esto es lo que permite el scroll. Si no lo tienes hoy, añádelo en el componente base que envuelve a cada bloque.

La clase `block-highlight` puede ser un fondo amarillo suave con transición CSS, para que el usuario vea claramente a qué bloque llegó:

```css
.block-highlight {
  background-color: rgba(250, 204, 21, 0.2);
  transition: background-color 0.5s ease-out;
}
```

### 2.6 Registro del nuevo tipo en el dispatcher de bloques

Donde tengas el componente que decide qué subcomponente renderizar según el `block.type`, agrega/renombra el caso:

```jsx
// components/notes/BlockRenderer.jsx
import { ReferenceBlockEditor, ReferenceBlockView } from './blocks/ReferenceBlock';

function BlockRenderer({ block, mode, onChange }) {
  switch (block.type) {
    case 'text':
      return <TextBlock ... />;
    case 'image_gallery':
      return <ImageGalleryBlock ... />;
    case 'callout':
      return <CalloutBlock ... />;
    case 'reference':  // antes: 'note_link'
      return mode === 'edit'
        ? <ReferenceBlockEditor block={block} onChange={onChange} />
        : <ReferenceBlockView block={block} />;
    default:
      return null;
  }
}
```

---

## 3. Orden de implementación recomendado

1. **Migración SQL** (`migration_block_references.sql`) en un entorno de prueba primero. Verifica conteos antes y después.
2. **Constante `BLOCK_TYPES`** y validador Joi actualizados. Tests unitarios del validador con casos buenos y malos.
3. **Utilidad `referenceLinks.js`** con tests unitarios cubriendo: URL absoluta válida, path relativo válido, URL con block hash, input vacío, formato basura.
4. **Componente `ReferenceBlockEditor` y `ReferenceBlockView`** + integración en el `BlockRenderer`.
5. **Botón "Copiar referencia"** en el hover del bloque y en el header de la nota.
6. **Hook `useScrollToBlockFromHash`** y CSS de highlight.
7. **QA manual**: crear referencia a bloque → copiar URL → pegar en otro bloque → click → verificar pestaña nueva + scroll + highlight.

---

## 4. Consideraciones de producción multiusuario

- **No hay queries adicionales por bloque referencia.** El render es local. Esto significa que una nota con 50 referencias se carga igual que una con 0.
- **No hay lógica de integridad referencial activa.** Borrar una nota no dispara nada en bloques que la referenciaban. Esto es deliberado y correcto para tu caso: mantiene el modelo simple y escalable.
- **`navigator.clipboard.writeText` requiere HTTPS en producción.** Asegúrate de que tu deploy tenga TLS configurado, sino el botón "Copiar referencia" fallará silenciosamente. Considera un fallback con `document.execCommand('copy')` solo si tu deploy puede tener tráfico HTTP residual.
- **URLs públicas y autenticación.** Como tus notas son privadas por usuario, asegúrate de que tu router maneje correctamente el caso "usuario A pega URL de su nota → cierra sesión → usuario B abre el link". La página de nota debe verificar autenticación y propiedad antes de renderizar. Esto seguramente ya lo tienes, pero vale la pena revisarlo en el contexto de que ahora las URLs se compartirán internamente con más frecuencia.

---

## 5. Qué NO incluye este diseño (por decisión consciente)

- Backlinks (no priorizados ahora; cuando los quieras, requerirán tabla `note_references`).
- Verificación de existencia al renderizar.
- Preview en hover.
- Embed/transclusión de contenido.
- Detección automática de referencias circulares (no aplica al no haber transclusión).
- Autocompletado tipo `@` al escribir en bloques de texto.

Estas son extensiones naturales que pueden venir después sin tocar lo construido aquí.




Implementation complete. Frontend builds and backend passes syntax checks.

To apply on running containers (per CLAUDE.md):


sudo docker exec -i tradelog-db psql -U postgres -d tradelog < database/022_migration_references.sql
sudo docker compose --env-file backend/.env up -d --build
Summary of changes:

DB migration 022_migration_references.sql — renames note_link → reference, moves linked_note_id into metadata.target_note_id and snapshots the linked note title into metadata.label. CHECK constraint updated.
Backend validator note.validator.js:36-65 — accepts reference type and target_note_id/target_block_id/label in metadata. updateCalloutMetadataSchema → updateBlockMetadataSchema.
Backend service note.service.js — allows metadata updates on reference blocks; tree/markdown exports rewritten for new shape.
Frontend util referenceLinks.js — buildNoteUrl, buildBlockUrl, parseReferenceUrl (integer IDs, accepts absolute or relative URLs).
Frontend block NoteReferenceBlock.jsx — paste-URL input when empty, editable label + "Abrir" link when configured, fallback view-mode.
Copy button CopyReferenceButton.jsx — hover variant on each block row, header variant next to note title.
Block insert menu NoteBlockInsert.jsx — splits "Sub-nota" (creates sub-note + reference) and "Referencia" (empty reference for paste-URL).
Move-sub-note NoteBlockList.jsx — targets sub-note-like references (metadata.target_note_id set, no target_block_id).
Scroll-to-hash NoteEditor.jsx — extended the existing ?highlight= handler to also accept #block-{id} so referenced URLs auto-scroll and pulse-highlight.
Existing linked_note_id column stays populated for new sub-note flows to preserve backward-compat with the repo's JOIN-based linked_note_title. Existing follow-up flags, DnD, exports continue to work on the renamed type. The obsolete NoteLinkBlock.jsx was removed.