import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, BarChart3, Plus, Moon, Sun, FlaskConical, BookOpen, Menu, X, LayoutDashboard, Users, ListTodo, Bell } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import UserMenu from '../auth/UserMenu.jsx';
import { useNotificationCount } from '../../hooks/useNotifications.js';

/**
 * Campana de la bandeja /recordatorios con el número de tarjetas abiertas (sin
 * badge cuando hay 0). Solo en el área de notas.
 */
const RemindersBell = ({ active, className = '' }) => {
  const { data: openCount = 0 } = useNotificationCount();
  return (
    <Link
      to="/recordatorios"
      title={openCount > 0 ? `Recordatorios (${openCount} pendientes)` : 'Recordatorios'}
      aria-label="Recordatorios"
      className={`relative p-2 rounded-lg transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
      } ${className}`}
    >
      <Bell className="w-5 h-5" />
      {openCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center
                         rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-none">
          {openCount > 99 ? '99+' : openCount}
        </span>
      )}
    </Link>
  );
};

const Header = () => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isActive = (path) =>
    path === '/'
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(path + '/');

  // Notas (y lo que cuelga de ellas) funciona casi como una app aparte: header
  // reducido, sin estadísticas/backtesting/usuarios ni el link a app.nesx.
  const isNotesArea = ['/notes', '/review', '/repaso', '/todo', '/recordatorios'].some(isActive);

  const primaryNav = isNotesArea
    ? [
        { path: '/', label: 'Trades', icon: TrendingUp },
        { path: '/notes', label: 'Notas', icon: BookOpen },
        { path: '/todo', label: 'TODO', icon: ListTodo },
      ].filter(({ path }) => !isActive(path)) // la sección actual no necesita link
    : [
        { path: '/', label: 'Trades', icon: TrendingUp },
        { path: '/create', label: 'Nuevo', icon: Plus },
        { path: '/notes', label: 'Notas', icon: BookOpen },
      ];

  const secondaryNav = isNotesArea
    ? []
    : [
        { path: '/stats', label: 'Estadísticas', icon: BarChart3 },
        { path: '/backtest', label: 'Backtesting', icon: FlaskConical },
        ...(isAdmin ? [{ path: '/admin/users', label: 'Usuarios', icon: Users }] : []),
      ];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="hidden sm:block text-xl font-bold text-gray-900 dark:text-white">
              Tradelog
            </span>
          </Link>

          {/* Nav horizontal — íconos en tablet (md), íconos + texto en desktop (lg+) */}
          <nav className="hidden md:flex items-center space-x-1">
            {[...primaryNav, ...secondaryNav].map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                title={label}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isActive(path)
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                  }`}
              >
                <Icon className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}

            {isNotesArea && <RemindersBell active={isActive('/recordatorios')} className="ml-1" />}

            <button
              onClick={toggleTheme}
              className="ml-2 p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {!isNotesArea && (
              <a
                href="https://app.nesx.co"
                title="Ir a app.nesx.co"
                className="p-2 rounded-lg text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <LayoutDashboard className="w-5 h-5" />
              </a>
            )}

            <div className="ml-2">
              <UserMenu showNotesExport={isNotesArea} />
            </div>
          </nav>

          {/* Mobile nav (phones < md): íconos primarios + hamburguesa */}
          <div className="flex md:hidden items-center gap-1" ref={menuRef}>
            {/* Primary links — icon only */}
            {primaryNav.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                title={label}
                className={`p-2 rounded-lg transition-colors
                  ${isActive(path)
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
              >
                <Icon className="w-5 h-5" />
              </Link>
            ))}

            {isNotesArea && <RemindersBell active={isActive('/recordatorios')} />}

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              aria-label="Menú"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute top-16 right-0 left-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg py-2 px-4 flex flex-col gap-1">
                {[...primaryNav, ...secondaryNav].map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive(path)
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                ))}

                <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-2 flex items-center justify-between px-3">
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {isDark ? 'Modo claro' : 'Modo oscuro'}
                  </button>
                  <UserMenu showNotesExport={isNotesArea} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
