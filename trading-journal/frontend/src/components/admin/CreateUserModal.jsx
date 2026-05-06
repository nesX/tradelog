import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { useCreateUser } from '../../hooks/useUsers';

export default function CreateUserModal({ actor, onClose }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const createMut = useCreateUser();

  const isSuperAdmin = actor?.role === 'super_admin';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    createMut.mutate(
      { email: email.trim().toLowerCase(), role },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal isOpen title="Agregar usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ejemplo@gmail.com"
          required
          autoFocus
        />

        <div>
          <label className="label">Rol</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">Usuario</option>
            {isSuperAdmin && <option value="admin">Administrador</option>}
          </select>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          El usuario podrá acceder iniciando sesión con su cuenta de Google.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={createMut.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
