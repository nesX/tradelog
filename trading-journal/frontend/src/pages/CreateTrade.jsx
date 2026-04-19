import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../components/common/Button.jsx';
import CreateTradeForm from '../components/trades/CreateTradeForm.jsx';
import { useCreateTrade } from '../hooks/useTrades.js';
import { useToast } from '../components/common/Toast.jsx';

/**
 * Página para crear un nuevo trade
 */
const CreateTrade = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const createMutation = useCreateTrade();

  // Manejar envío del formulario
  const handleSubmit = async (formData, imageFiles) => {
    try {
      await createMutation.mutateAsync({
        tradeData: formData,
        imageFiles,
      });

      toast.success('Trade creado exitosamente');
      navigate('/');
    } catch (error) {
      toast.error(error.message || 'Error al crear el trade');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          icon={ArrowLeft}
          className="mb-4"
        >
          Volver
        </Button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Crear Nuevo Trade</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Registra un nuevo trade manualmente
        </p>
      </div>

      {/* Formulario */}
      <div className="card max-w-2xl">
        <CreateTradeForm
          onSubmit={handleSubmit}
          isLoading={createMutation.isPending}
          onCancel={() => navigate('/')}
        />
      </div>
    </div>
  );
};

export default CreateTrade;
