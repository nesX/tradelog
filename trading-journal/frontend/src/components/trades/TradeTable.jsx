import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import TradeRow from './TradeRow.jsx';
import { TableLoading } from '../common/Loading.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Modal from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { useDeleteTrade } from '../../hooks/useTrades.js';
import { useToast } from '../common/Toast.jsx';

/**
 * Componente de tabla de trades
 */
const TradeTable = ({
  trades = [],
  isLoading,
  pagination,
  onPageChange,
  onEditTrade,
  onCreateTrade,
}) => {
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, trade: null });
  const deleteMutation = useDeleteTrade();
  const toast = useToast();

  // Trade cuyo modal de detalle está abierto. Se navega sobre `trades`, que ya
  // viene filtrado y ordenado por el servidor, así que respeta lo que muestra la tabla.
  const [detailTradeId, setDetailTradeId] = useState(null);
  // Al cruzar de página: qué trade abrir cuando llegue la página nueva
  const [pendingDetail, setPendingDetail] = useState(null); // { page, edge: 'first' | 'last' }

  const currentPage = pagination?.page ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const detailIndex = trades ? trades.findIndex((t) => t.id === detailTradeId) : -1;
  const hasPrevTrade = detailIndex > 0 || currentPage > 1;
  const hasNextTrade =
    (detailIndex !== -1 && detailIndex < trades.length - 1) || currentPage < totalPages;

  const closeDetail = () => {
    setDetailTradeId(null);
    setPendingDetail(null);
  };

  // direction: -1 anterior, +1 siguiente
  const navigateDetail = (direction) => {
    if (detailIndex === -1 || pendingDetail) return;

    const target = trades[detailIndex + direction];
    if (target) {
      setDetailTradeId(target.id);
      return;
    }

    const newPage = currentPage + direction;
    if (newPage < 1 || newPage > totalPages) return;
    setPendingDetail({ page: newPage, edge: direction > 0 ? 'first' : 'last' });
    onPageChange(newPage);
  };

  // Cuando llega la página solicitada, abrir su primer/último trade
  useEffect(() => {
    if (!pendingDetail || pagination?.page !== pendingDetail.page || !trades?.length) return;
    const target = pendingDetail.edge === 'first' ? trades[0] : trades[trades.length - 1];
    setDetailTradeId(target.id);
    setPendingDetail(null);
  }, [pendingDetail, pagination?.page, trades]);

  const detailActions = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigateDetail(-1)}
        disabled={!hasPrevTrade || Boolean(pendingDetail)}
        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        title="Trade anterior"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => navigateDetail(1)}
        disabled={!hasNextTrade || Boolean(pendingDetail)}
        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        title="Trade siguiente"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );

  // Manejar eliminación
  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: deleteModal.trade.id });
      toast.success('Trade eliminado exitosamente');
      setDeleteModal({ isOpen: false, trade: null });
    } catch (error) {
      toast.error(error.message || 'Error al eliminar el trade');
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <TableLoading rows={10} cols={10} />
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <div className="card">
        <EmptyState
          title="No hay trades"
          description="Aún no has registrado ningún trade. Crea uno nuevo o importa desde CSV."
        />
      </div>
    );
  }

  return (
    <>
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th className="w-14"></th>
                <th>Símbolo</th>
                <th>Tipo</th>
                <th>Fecha Entrada</th>
                <th className="text-right">Precio Entrada</th>
                <th className="text-right">Precio Salida</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">P&L</th>
                <th>Estado</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {trades.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  onEdit={onEditTrade}
                  onDelete={(trade) => setDeleteModal({ isOpen: true, trade })}
                  isDetailOpen={trade.id === detailTradeId}
                  onOpenDetail={(trade) => setDetailTradeId(trade.id)}
                  onCloseDetail={closeDetail}
                  detailActions={trade.id === detailTradeId ? detailActions : null}
                />
              ))}
              {/* Fila para crear nuevo trade */}
              <tr
                onClick={onCreateTrade}
                className="hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer transition-colors group"
              >
                <td colSpan={10} className="px-4 py-3">
                  <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="font-medium">Nuevo Trade</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Mostrando {trades.length} de {pagination.total} trades
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-sm text-gray-600 dark:text-gray-400">
                Página {pagination.page} de {pagination.totalPages}
              </span>

              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de confirmación de eliminación */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, trade: null })}
        title="Eliminar Trade"
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          ¿Estás seguro de eliminar el trade de{' '}
          <span className="font-medium">{deleteModal.trade?.symbol}</span>?
          Esta acción no se puede deshacer.
        </p>

        <div className="flex justify-end space-x-3">
          <Button
            variant="secondary"
            onClick={() => setDeleteModal({ isOpen: false, trade: null })}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteMutation.isPending}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default TradeTable;
