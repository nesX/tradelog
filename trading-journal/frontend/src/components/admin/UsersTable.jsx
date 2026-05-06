import { Trash2, Shield, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useDeleteUser, useUpdateUserRole } from '../../hooks/useUsers';
import { formatDate } from '../../utils/formatters';

const roleConfig = {
  super_admin: { label: 'Super Admin', icon: ShieldCheck, className: 'text-purple-600 dark:text-purple-400' },
  admin: { label: 'Administrador', icon: Shield, className: 'text-blue-600 dark:text-blue-400' },
  user: { label: 'Usuario', icon: UserIcon, className: 'text-gray-600 dark:text-gray-400' },
};

export default function UsersTable({ users, actor, pagination, onPageChange }) {
  const deleteMut = useDeleteUser();
  const roleMut = useUpdateUserRole();

  const isSuperAdmin = actor?.role === 'super_admin';

  const handleDelete = (u) => {
    if (!window.confirm(`¿Eliminar a ${u.email}?`)) return;
    deleteMut.mutate(u.id);
  };

  const handleToggleAdmin = (u) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`¿Cambiar rol de ${u.email} a "${newRole}"?`)) return;
    roleMut.mutate({ id: u.id, role: newRole });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Email</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Rol</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Último login</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Creado</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const cfg = roleConfig[u.role] || roleConfig.user;
              const Icon = cfg.icon;
              const isProtected = u.role === 'super_admin';
              const isSelf = u.id === actor?.id;

              return (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="p-3 text-gray-900 dark:text-gray-100">{u.email}</td>
                  <td className="p-3">
                    <span className={`flex items-center gap-1 ${cfg.className}`}>
                      <Icon size={15} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">
                    {u.last_login_at ? formatDate(u.last_login_at) : '—'}
                  </td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="p-3 text-right space-x-3">
                    {isSuperAdmin && !isProtected && !isSelf && (
                      <button
                        onClick={() => handleToggleAdmin(u)}
                        className="text-blue-600 hover:underline text-xs"
                        disabled={roleMut.isPending}
                      >
                        {u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                      </button>
                    )}
                    {!isProtected && !isSelf && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="text-red-500 hover:text-red-700 inline-flex items-center"
                        disabled={deleteMut.isPending}
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  No hay usuarios
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination?.totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-500">
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} usuarios
          </span>
          <div className="space-x-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
