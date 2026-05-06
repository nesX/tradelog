import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import UsersTable from '../../components/admin/UsersTable';
import CreateUserModal from '../../components/admin/CreateUserModal';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';

export default function Users() {
  const { user: actor } = useAuth();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError } = useUsers({ page, limit: 20 });

  if (isLoading) return <Loading />;
  if (isError) return <p className="text-red-500 p-6">Error al cargar usuarios</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de usuarios</h1>
        <Button onClick={() => setCreateOpen(true)} icon={Plus}>
          Agregar usuario
        </Button>
      </div>

      <UsersTable
        users={data?.users ?? []}
        actor={actor}
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      {createOpen && (
        <CreateUserModal
          actor={actor}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
