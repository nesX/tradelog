import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import TradeTable from '../components/trades/TradeTable.jsx';
import TradeFilters from '../components/trades/TradeFilters.jsx';
import TradeStats from '../components/trades/TradeStats.jsx';
import CSVImport from '../components/trades/CSVImport.jsx';
import Modal from '../components/common/Modal.jsx';
import Button from '../components/common/Button.jsx';
import CreateTradeForm from '../components/trades/CreateTradeForm.jsx';
import { useTrades, useUpdateTrade, useDeleteTradeImage } from '../hooks/useTrades.js';
import { useToast } from '../components/common/Toast.jsx';

/**
 * Página principal - Historial de Trades
 */
const Home = () => {
  const navigate = useNavigate();
  const toast = useToast();

  // Estado de filtros
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    sortBy: 'entry_date',
    sortDir: 'DESC',
  });

  // Estado de modales
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, trade: null });
  const [deletingImageId, setDeletingImageId] = useState(null);

  // Query de trades
  const { data, isLoading, error } = useTrades(filters);

  // Mutations
  const updateMutation = useUpdateTrade();
  const deleteImageMutation = useDeleteTradeImage();

  // Manejar cambio de página
  const handlePageChange = (newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  // Manejar edición de trade
  const handleEditSubmit = async (formData, imageFiles) => {
    try {
      await updateMutation.mutateAsync({
        id: editModal.trade.id,
        updateData: formData,
        imageFiles,
      });
      toast.success('Trade actualizado exitosamente');
      setEditModal({ isOpen: false, trade: null });
    } catch (error) {
      toast.error(error.message || 'Error al actualizar el trade');
    }
  };

  // Manejar eliminación de imagen
  const handleDeleteImage = async (imageId) => {
    try {
      setDeletingImageId(imageId);
      await deleteImageMutation.mutateAsync({
        tradeId: editModal.trade.id,
        imageId,
      });
      // Actualizar el trade en el modal para reflejar la imagen eliminada
      setEditModal((prev) => ({
        ...prev,
        trade: {
          ...prev.trade,
          images: prev.trade.images.filter((img) => img.id !== imageId),
        },
      }));
      toast.success('Imagen eliminada');
    } catch (error) {
      toast.error(error.message || 'Error al eliminar la imagen');
    } finally {
      setDeletingImageId(null);
    }
  };

  return (
    <div>
      {/* Header de página */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Historial de Trades</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestiona y analiza todos tus trades
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="secondary"
            onClick={() => setShowCSVImport(true)}
            icon={Upload}
          >
            Importar CSV
          </Button>

          <Button onClick={() => navigate('/create')} icon={Plus}>
            Nuevo Trade
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <TradeStats />

      {/* Filtros */}
      <TradeFilters filters={filters} onFiltersChange={setFilters} />

      {/* Tabla de trades */}
      <TradeTable
        trades={data?.trades}
        isLoading={isLoading}
        pagination={data ? {
          page: data.page,
          totalPages: data.totalPages,
          total: data.total,
        } : null}
        onPageChange={handlePageChange}
        onEditTrade={(trade) => setEditModal({ isOpen: true, trade })}
        onCreateTrade={() => navigate('/create')}
      />

      {/* Modal de importación CSV */}
      <CSVImport
        isOpen={showCSVImport}
        onClose={() => setShowCSVImport(false)}
      />

      {/* Modal de edición */}
      <Modal
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, trade: null })}
        title="Editar Trade"
        size="lg"
      >
        {editModal.trade && (
          <CreateTradeForm
            initialData={editModal.trade}
            onSubmit={handleEditSubmit}
            isLoading={updateMutation.isPending}
            onCancel={() => setEditModal({ isOpen: false, trade: null })}
            onDeleteImage={handleDeleteImage}
            deletingImageId={deletingImageId}
          />
        )}
      </Modal>
    </div>
  );
};

export default Home;
