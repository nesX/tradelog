import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Tags as TagsIcon, Plus, Pencil, Trash2, Check, X, ArrowUp, ArrowDown, Search, FolderPlus } from 'lucide-react';
import {
  useNoteTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useTagGroups,
  useCreateTagGroup,
  useUpdateTagGroup,
  useDeleteTagGroup,
  useMoveTagGroup,
  useMoveTag,
} from '../hooks/useNotes.js';
import NoteTagBadge from '../components/notes/NoteTagBadge.jsx';
import { FREE_GROUP, groupTags, filterTags, getTagGroup, listTagGroups } from '../utils/tagGroups.js';

const DEFAULT_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
];

// text-base en los inputs: con menos, iOS hace zoom al enfocarlos.
const inputClass = `text-base bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg
  px-2.5 py-1.5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`;
const colorInputClass = `w-9 h-9 flex-shrink-0 rounded-lg cursor-pointer border border-gray-300 dark:border-gray-600
  p-0.5 bg-white dark:bg-gray-700`;
const primaryButtonClass = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
  bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`;
const iconButtonClass = `p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100
  dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors
  disabled:opacity-30 disabled:pointer-events-none`;
const confirmButtonClass = 'text-sm px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50';
const cancelButtonClass = `text-sm px-2.5 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800
  dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-100`;

const groupKey = (group) => group.id ?? 'libre';

const ErrorText = ({ children }) =>
  children ? <p className="text-sm text-red-700 dark:text-red-400 break-words">{children}</p> : null;

const ColorPalette = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {DEFAULT_COLORS.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        title={c}
        aria-label={`Color ${c}`}
        className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
        style={{ backgroundColor: c, borderColor: value?.toLowerCase() === c.toLowerCase() ? '#1d4ed8' : 'transparent' }}
      />
    ))}
  </div>
);

// Grupos del usuario más Libre. El valor es el id del grupo, o null para Libre.
const GroupSelect = ({ groups, value, onChange, className = '' }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    className={`${inputClass} ${className}`}
    aria-label="Grupo del tag"
  >
    {listTagGroups(groups).map((g) => (
      <option key={groupKey(g)} value={g.id ?? ''}>
        {g.label}
      </option>
    ))}
  </select>
);

/**
 * Formulario de tag nuevo. Arriba de la página lleva selector de grupo; en una
 * tarjeta, el grupo es el de la tarjeta. Elegir un grupo propone su color.
 */
const NewTagForm = ({ groups, initialGroupId = null, withGroupSelect = false, autoFocus = false, onClose }) => {
  const createTag = useCreateTag({ silenceError: true });
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(initialGroupId);
  const [color, setColor] = useState(() => getTagGroup(groups, initialGroupId).color);
  const [error, setError] = useState('');

  const handleGroup = (id) => {
    setGroupId(id);
    setColor(getTagGroup(groups, id).color);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    try {
      await createTag.mutateAsync({ name: trimmed, color, group_id: groupId });
      // Queda listo para el siguiente tag del mismo grupo.
      setName('');
      setColor(getTagGroup(groups, groupId).color);
    } catch (err) {
      setError(err?.message || 'Error al crear el tag');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className={colorInputClass}
          aria-label="Color del tag"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
          placeholder="Nombre del tag"
          aria-label="Nombre del tag"
          maxLength={100}
          autoFocus={autoFocus}
          className={`${inputClass} flex-1 min-w-[10rem]`}
        />
        {withGroupSelect && <GroupSelect groups={groups} value={groupId} onChange={handleGroup} />}
        <button type="submit" disabled={!name.trim() || createTag.isPending} className={primaryButtonClass}>
          <Plus className="w-4 h-4" />
          Crear
        </button>
        {onClose && (
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar" className={iconButtonClass}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <ColorPalette value={color} onChange={setColor} />
      <ErrorText>{error}</ErrorText>
    </form>
  );
};

/** Nombre y color de un grupo: crear uno nuevo o renombrar/recolorear uno existente. */
const GroupForm = ({ initialName = '', initialColor, submitLabel, isPending, onSubmit, onCancel, error }) => {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) onSubmit({ name: name.trim(), color });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className={colorInputClass}
          aria-label="Color del grupo"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          placeholder="Nombre del grupo"
          aria-label="Nombre del grupo"
          maxLength={50}
          autoFocus
          className={`${inputClass} flex-1 min-w-[10rem]`}
        />
        <button type="submit" disabled={!name.trim() || isPending} className={primaryButtonClass}>
          <Check className="w-4 h-4" />
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} title="Cancelar" aria-label="Cancelar" className={iconButtonClass}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <ColorPalette value={color} onChange={setColor} />
      <p className="text-xs text-gray-600 dark:text-gray-300">El color es el que se propone a los tags nuevos del grupo.</p>
      <ErrorText>{error}</ErrorText>
    </form>
  );
};

/**
 * Fila de un tag: badge, ver sus bloques en /buscar, subir/bajar dentro del grupo
 * (`onMove`; sin él no hay flechas), edición inline y borrado.
 */
const TagRow = ({ tag, groups, isFirst, isLast, onMove }) => {
  const updateTag = useUpdateTag({ silenceError: true });
  const deleteTag = useDeleteTag({ silenceError: true });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [groupId, setGroupId] = useState(tag.group_id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => {
    setName(tag.name);
    setColor(tag.color);
    setGroupId(getTagGroup(groups, tag.group_id).id);
    setError('');
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    try {
      await updateTag.mutateAsync({ tagId: tag.id, data: { name: name.trim(), color, group_id: groupId } });
      setEditing(false);
    } catch (err) {
      setError(err?.message || 'Error al actualizar el tag');
    }
  };

  const handleDelete = async () => {
    setError('');
    try {
      await deleteTag.mutateAsync(tag.id);
    } catch (err) {
      setError(err?.message || 'Error al eliminar el tag');
      setConfirmDelete(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-1.5 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={colorInputClass}
            aria-label="Color del tag"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            maxLength={100}
            autoFocus
            aria-label="Nombre del tag"
            className={`${inputClass} flex-1 min-w-[8rem]`}
          />
          <GroupSelect groups={groups} value={groupId} onChange={setGroupId} />
          <div className="flex items-center">
            <button
              type="submit"
              disabled={!name.trim() || updateTag.isPending}
              title="Guardar"
              aria-label="Guardar"
              className={`${iconButtonClass} text-green-700 dark:text-green-400`}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              title="Cancelar"
              aria-label="Cancelar"
              className={iconButtonClass}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    );
  }

  return (
    <div className="px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words">
          <NoteTagBadge tag={tag} size="lg" />
        </span>
        <div className="ml-auto flex items-center">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="text-sm text-red-700 dark:text-red-400">Se quitará de todas las notas y bloques</span>
              <button onClick={handleDelete} disabled={deleteTag.isPending} className={confirmButtonClass}>
                Eliminar
              </button>
              <button onClick={() => setConfirmDelete(false)} className={cancelButtonClass}>
                No
              </button>
            </div>
          ) : (
            <>
              <Link
                to={`/buscar?tags=${tag.id}`}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-blue-700 hover:bg-blue-50
                           dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                Ver bloques
              </Link>
              {onMove && (
                <>
                  <button
                    onClick={() => onMove(tag.id, -1)}
                    disabled={isFirst}
                    title="Subir tag"
                    aria-label="Subir tag"
                    className={iconButtonClass}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onMove(tag.id, 1)}
                    disabled={isLast}
                    title="Bajar tag"
                    aria-label="Bajar tag"
                    className={iconButtonClass}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </>
              )}
              <button onClick={startEdit} title="Editar tag" aria-label="Editar tag" className={iconButtonClass}>
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title="Eliminar tag"
                aria-label="Eliminar tag"
                className={`${iconButtonClass} hover:text-red-600 dark:hover:text-red-400`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
};

const deleteGroupMessage = (count) => {
  if (count === 0) return 'El grupo está vacío.';
  if (count === 1) return 'Su tag pasará a Libre. No se quita de ninguna nota ni bloque.';
  return `Sus ${count} tags pasarán a Libre. No se quitan de ninguna nota ni bloque.`;
};

/**
 * Tarjeta de un grupo con sus tags. La cabecera lleva las acciones del grupo
 * (renombrar y recolorear, subir/bajar, borrar); la de Libre solo el "+". Los
 * tags se suben y bajan dentro de la tarjeta (`onMoveTag`), salvo con el filtro
 * activo: con tags ocultos, "subir" lo cambiaría por uno que no se ve.
 */
const GroupCard = ({
  group,
  groups,
  tags,
  totalCount,
  isFirst,
  isLast,
  adding,
  onToggleAdd,
  onMove,
  onMoveTag,
  filtering,
}) => {
  const updateGroup = useUpdateTagGroup();
  const deleteGroup = useDeleteTagGroup();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const isFree = group.id === null;

  const handleRename = async (data) => {
    setError('');
    try {
      await updateGroup.mutateAsync({ groupId: group.id, data });
      setEditing(false);
    } catch (err) {
      setError(err?.message || 'Error al actualizar el grupo');
    }
  };

  const handleDelete = async () => {
    setError('');
    try {
      await deleteGroup.mutateAsync(group.id);
    } catch (err) {
      setError(err?.message || 'Error al eliminar el grupo');
      setConfirmDelete(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 space-y-2">
        {editing ? (
          <GroupForm
            initialName={group.label}
            initialColor={group.color}
            submitLabel="Guardar"
            isPending={updateGroup.isPending}
            onSubmit={handleRename}
            onCancel={() => {
              setEditing(false);
              setError('');
            }}
            error={error}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
            <h2 className="min-w-0 truncate text-reading/snug font-semibold text-gray-900 dark:text-white">
              {group.label}
            </h2>
            <span
              className="flex-shrink-0 px-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300"
              title={`${totalCount} tag${totalCount !== 1 ? 's' : ''}`}
            >
              {totalCount}
            </span>
            {isFree && <span className="hidden sm:inline text-xs text-gray-600 dark:text-gray-300">tags sin grupo</span>}
            <div className="ml-auto flex items-center flex-shrink-0">
              {!isFree && (
                <>
                  <button
                    onClick={() => onMove(group.id, -1)}
                    disabled={isFirst}
                    title="Subir grupo"
                    aria-label="Subir grupo"
                    className={iconButtonClass}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onMove(group.id, 1)}
                    disabled={isLast}
                    title="Bajar grupo"
                    aria-label="Bajar grupo"
                    className={iconButtonClass}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDelete(false);
                      setError('');
                      setEditing(true);
                    }}
                    title="Renombrar o cambiar el color"
                    aria-label="Renombrar o cambiar el color del grupo"
                    className={iconButtonClass}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Eliminar grupo"
                    aria-label="Eliminar grupo"
                    className={`${iconButtonClass} hover:text-red-600 dark:hover:text-red-400`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={onToggleAdd}
                aria-pressed={adding}
                title={`Nuevo tag en ${group.label}`}
                aria-label={`Nuevo tag en ${group.label}`}
                className={`${iconButtonClass} ${adding ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : ''}`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-red-700 dark:text-red-400">{deleteGroupMessage(totalCount)}</span>
            <button onClick={handleDelete} disabled={deleteGroup.isPending} className={confirmButtonClass}>
              Eliminar
            </button>
            <button onClick={() => setConfirmDelete(false)} className={cancelButtonClass}>
              No
            </button>
          </div>
        )}
        {!editing && <ErrorText>{error}</ErrorText>}
      </div>

      {adding && (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
          <NewTagForm groups={groups} initialGroupId={group.id} autoFocus onClose={onToggleAdd} />
        </div>
      )}

      <div className="p-1.5">
        {tags.length > 0 ? (
          tags.map((tag, i) => (
            <TagRow
              key={tag.id}
              tag={tag}
              groups={groups}
              isFirst={i === 0}
              isLast={i === tags.length - 1}
              onMove={!filtering && tags.length > 1 ? onMoveTag : undefined}
            />
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">
            {filtering ? 'Ningún tag coincide.' : 'Sin tags.'}
          </p>
        )}
      </div>
    </section>
  );
};

/**
 * Gestión de tags y de sus grupos: una tarjeta por grupo en orden canónico
 * (incluidos los vacíos) y Libre al final. Reemplaza al modal del sidebar de Notas.
 */
export default function Tags() {
  const { data: tags = [], isLoading: tagsLoading, error: tagsError } = useNoteTags();
  const { data: groups, isLoading: groupsLoading, error: groupsError } = useTagGroups();
  const createGroup = useCreateTagGroup();
  const { move } = useMoveTagGroup();
  const { move: moveTag } = useMoveTag();
  const [filterText, setFilterText] = useState('');
  const [addingKey, setAddingKey] = useState(null); // tarjeta con el formulario de tag abierto
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  const filtering = filterText.trim() !== '';
  const cards = useMemo(() => {
    if (!groups) return [];
    const counts = new Map(groupTags(tags, groups, { includeEmpty: true }).map((g) => [g.id, g.tags.length]));
    // Con el filtro activo solo se ven los grupos con coincidencias.
    return groupTags(filterTags(tags, filterText), groups, { includeEmpty: !filtering }).map((g) => ({
      ...g,
      totalCount: counts.get(g.id) ?? 0,
    }));
  }, [tags, groups, filterText, filtering]);

  // Color propuesto para un grupo nuevo: el primero de la paleta que no usa otro grupo.
  const nextGroupColor = useMemo(
    () =>
      DEFAULT_COLORS.find((c) => !(groups ?? []).some((g) => g.color.toLowerCase() === c.toLowerCase())) ??
      DEFAULT_COLORS[0],
    [groups]
  );

  const handleCreateGroup = async (data) => {
    setGroupError('');
    try {
      const res = await createGroup.mutateAsync(data);
      setCreatingGroup(false);
      // El grupo nuevo abre su formulario de tag (el autofocus lo trae a la vista).
      if (res?.data?.id) setAddingKey(res.data.id);
    } catch (err) {
      setGroupError(err?.message || 'Error al crear el grupo');
    }
  };

  const loading = tagsLoading || groupsLoading;
  const loadError = tagsError || groupsError;
  const ownGroupCount = groups?.length ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TagsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tags</h1>
        <button
          onClick={() => {
            setGroupError('');
            setCreatingGroup((v) => !v);
          }}
          aria-expanded={creatingGroup}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border
                     border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          Nuevo grupo
        </button>
      </div>

      {creatingGroup && (
        <section className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 p-3 space-y-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Nuevo grupo</h2>
          <GroupForm
            initialColor={nextGroupColor}
            submitLabel="Crear"
            isPending={createGroup.isPending}
            onSubmit={handleCreateGroup}
            onCancel={() => {
              setCreatingGroup(false);
              setGroupError('');
            }}
            error={groupError}
          />
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <p className="py-4 text-sm text-red-700 dark:text-red-400">{loadError.message || 'No se pudieron cargar los tags.'}</p>
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Nuevo tag</h2>
            <NewTagForm groups={groups} initialGroupId={FREE_GROUP.id} withGroupSelect />
          </section>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filtrar tags…"
              aria-label="Filtrar tags"
              className="flex-1 min-w-0 bg-transparent text-base text-gray-800 dark:text-gray-100
                         placeholder-gray-500 dark:placeholder-gray-400 outline-none"
            />
          </div>

          {cards.length === 0 ? (
            <p className="py-6 text-center text-reading/snug text-gray-500 dark:text-gray-400">Ningún tag coincide.</p>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => {
                const index = groups.findIndex((g) => g.id === card.id);
                return (
                  <GroupCard
                    key={groupKey(card)}
                    group={card}
                    groups={groups}
                    tags={card.tags}
                    totalCount={card.totalCount}
                    isFirst={index === 0}
                    isLast={index === ownGroupCount - 1}
                    adding={addingKey === groupKey(card)}
                    onToggleAdd={() =>
                      setAddingKey((current) => (current === groupKey(card) ? null : groupKey(card)))
                    }
                    onMove={move}
                    onMoveTag={moveTag}
                    filtering={filtering}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
