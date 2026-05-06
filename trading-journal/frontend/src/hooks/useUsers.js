import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, createAdminUser, updateAdminUserRole, deleteAdminUser } from '../api/endpoints';
import { useToast } from '../components/common/Toast';

export const userKeys = {
  all: ['users'],
  lists: () => [...userKeys.all, 'list'],
  list: (params) => [...userKeys.lists(), params],
  detail: (id) => [...userKeys.all, 'detail', id],
};

export function useUsers(params = { page: 1, limit: 20 }) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => listUsers(params),
    select: (response) => response.data,
    keepPreviousData: true,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('Usuario creado');
    },
    onError: (err) => {
      toast.error(err?.message || 'Error al crear usuario');
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, role }) => updateAdminUserRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('Rol actualizado');
    },
    onError: (err) => {
      toast.error(err?.message || 'Error al actualizar rol');
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success('Usuario eliminado');
    },
    onError: (err) => {
      toast.error(err?.message || 'Error al eliminar usuario');
    },
  });
}
