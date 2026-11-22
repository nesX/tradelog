import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, Settings, FileJson, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useNotesExport } from '../../hooks/useNotesExport.js';

/**
 * Menu de usuario con avatar y opciones.
 * `showNotesExport` añade la exportación de notas (solo en la sección de notas).
 */
const UserMenu = ({ showNotesExport = false }) => {
  const { user, logout } = useAuth();
  const { loading: exporting, exportJSON, exportMarkdown } = useNotesExport();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Cerrar menú al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  const handleExport = (exportFn) => {
    setIsOpen(false);
    exportFn();
  };

  if (!user) return null;

  // Obtener inicial del email
  const initial = user.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">{initial}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-600 dark:text-gray-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          {/* Info del usuario */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-medium">{initial}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {user.email}
              </p>
            </div>
          </div>

          {/* Opciones */}
          <Link
            to="/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Settings className="w-4 h-4 mr-3" />
            Configuración
          </Link>
          {showNotesExport && (
            <>
              <button
                onClick={() => handleExport(exportJSON)}
                disabled={!!exporting}
                className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <FileJson className="w-4 h-4 mr-3 text-blue-500" />
                {exporting === 'json' ? 'Exportando...' : 'Exportar notas (JSON)'}
              </button>
              <button
                onClick={() => handleExport(exportMarkdown)}
                disabled={!!exporting}
                className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 mr-3 text-green-500" />
                {exporting === 'md' ? 'Exportando...' : 'Exportar notas (Markdown)'}
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
