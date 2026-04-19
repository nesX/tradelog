import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useSystems, useSystem, useCreateSystem, useUpdateSystemName, useDeleteSystem } from '../hooks/useSystems.js';
import { useTimeframes, useCreateTimeframe, useDeleteTimeframe } from '../hooks/useTimeframes.js';
import { useToast } from '../components/common/Toast.jsx';
import Button from '../components/common/Button.jsx';
import Modal from '../components/common/Modal.jsx';

// ==================
// Modal crear sistema
// ==================
const CreateSystemModal = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const createSystem = useCreateSystem();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [signals, setSignals] = useState([{ name: '', uses_scale: false }]);

  const reset = () => {
    setName('');
    setDescription('');
    setSignals([{ name: '', uses_scale: false }]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addSignal = () => setSignals([...signals, { name: '', uses_scale: false }]);

  const removeSignal = (i) => setSignals(signals.filter((_, idx) => idx !== i));

  const updateSignal = (i, field, value) =>
    setSignals(signals.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (signals.some(s => !s.name.trim())) {
      showToast('Todas las señales deben tener nombre', 'error');
      return;
    }
    try {
      await createSystem.mutateAsync({ name: name.trim(), description: description.trim() || null, signals });
      showToast('Estrategia creada exitosamente', 'success');
      handleClose();
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Error al crear estrategia', 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Crear estrategia" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Advertencia */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Una vez creada la estrategia no podrás agregar ni eliminar señales. Define todas las señales antes de continuar.
          </p>
        </div>

        <div>
          <label className="label">Nombre de la estrategia *</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Mi sistema principal"
            required
          />
        </div>

        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descripción del sistema..."
          />
        </div>

        {/* Señales */}
        <div>
          <label className="label">Señales *</label>
          <div className="space-y-2">
            {signals.map((sig, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={sig.name}
                  onChange={e => updateSignal(i, 'name', e.target.value)}
                  placeholder={`Señal ${i + 1}`}
                />
                <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={sig.uses_scale}
                    onChange={e => updateSignal(i, 'uses_scale', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600"
                  />
                  Escala
                </label>
                {signals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSignal(i)}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSignal}
            className="mt-2 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Plus className="w-4 h-4" /> Agregar señal
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Señales con <strong>Escala</strong>: se registran como Débil / Media / Fuerte / Importante.<br />
          Sin escala: simplemente presente o ausente.
        </p>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button type="submit" isLoading={createSystem.isPending}>Crear estrategia</Button>
        </div>
      </form>
    </Modal>
  );
};

// ==================
// Fila de sistema
// ==================
const SystemRow = ({ system }) => {
  const { showToast } = useToast();
  const updateName = useUpdateSystemName();
  const deleteSystem = useDeleteSystem();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(system.name);
  const [showSignals, setShowSignals] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Cargar señales del sistema solo cuando el usuario expande
  const { data: systemDetail } = useSystem(showSignals ? system.id : null);

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === system.name) {
      setEditing(false);
      setEditName(system.name);
      return;
    }
    try {
      await updateName.mutateAsync({ id: system.id, name: editName.trim() });
      showToast('Nombre actualizado', 'success');
      setEditing(false);
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Error al actualizar', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSystem.mutateAsync(system.id);
      showToast('Estrategia eliminada', 'success');
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Error al eliminar', 'error');
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800">
        {editing ? (
          <input
            className="input flex-1 text-sm"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditing(false); setEditName(system.name); } }}
            autoFocus
          />
        ) : (
          <span className="flex-1 font-medium text-gray-900 dark:text-white">{system.name}</span>
        )}

        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {system.signal_count} señal{system.signal_count !== 1 ? 'es' : ''}
        </span>

        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={handleSaveName} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded" title="Guardar">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setEditing(false); setEditName(system.name); }} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Cancelar">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar nombre">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => setShowSignals(!showSignals)} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Ver señales">
                {showSignals ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600 dark:text-red-400">¿Confirmar?</span>
                  <button onClick={handleDelete} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Archivar sistema">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showSignals && (
        <div className="px-4 pb-3 pt-0 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 pt-3">Señales:</p>
          <div className="flex flex-wrap gap-2">
            {!systemDetail && <span className="text-xs text-gray-400">Cargando...</span>}
            {systemDetail?.signals?.map(sig => (
              <span key={sig.id} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-gray-700 dark:text-gray-300">
                {sig.name}
                {sig.uses_scale && (
                  <span className="text-blue-500 text-xs">(escala)</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================
// Sección Timeframes
// ==================
const TimeframesSection = () => {
  const { showToast } = useToast();
  const { data: timeframes = [], isLoading } = useTimeframes();
  const createTf = useCreateTimeframe();
  const deleteTf = useDeleteTimeframe();

  const [label, setLabel] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    try {
      await createTf.mutateAsync({ label: label.trim(), sort_order: timeframes.length });
      setLabel('');
      showToast('Timeframe agregado', 'success');
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Error al agregar', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTf.mutateAsync(id);
      showToast('Timeframe eliminado', 'success');
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Error al eliminar', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mis timeframes</h2>

      {isLoading ? (
        <p className="text-sm text-gray-500">Cargando...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {timeframes.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay timeframes configurados.</p>
          )}
          {timeframes.map(tf => (
            <div key={tf.id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{tf.label}</span>
              {deletingId === tf.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600 dark:text-red-400">¿Confirmar?</span>
                  <button onClick={() => handleDelete(tf.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeletingId(null)} className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setDeletingId(tf.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="1m, 5m, 1h, 4h, Diario..."
        />
        <Button type="submit" variant="secondary" isLoading={createTf.isPending}>
          <Plus className="w-4 h-4" />
          Agregar
        </Button>
      </form>
    </section>
  );
};

// ==================
// Página principal
// ==================
const Settings = () => {
  const { data: systems = [], isLoading } = useSystems();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Para mostrar señales en SystemRow necesitamos las señales, pero el listado solo trae signal_count.
  // Hacemos que SystemRow las cargue al expandir (reutilizando useSystem).
  // En este caso, mejor traer las señales embebidas en el listado.
  // El backend ya las incluye para GET /api/systems/{id}, para el listado no.
  // Pasamos las señales solo cuando el usuario expande → leer con useSystem(id) dentro de SystemRow.

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestiona tus estrategias de trading y timeframes.
        </p>
      </div>

      {/* Sistemas */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mis estrategias</h2>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nueva estrategia
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Cargando estrategias...</p>
        ) : (
          <div className="space-y-3">
            {systems.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No tienes estrategias creadas. Crea una para empezar a etiquetar tus trades.
              </p>
            )}
            {systems.map(system => (
              <SystemRow key={system.id} system={system} />
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Timeframes */}
      <TimeframesSection />

      <CreateSystemModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  );
};

export default Settings;
