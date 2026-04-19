import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, BarChart3, Plus, Moon, Sun, FlaskConical, BookOpen, Menu, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import UserMenu from '../auth/UserMenu.jsx';

const Header = () => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const primaryNav = [
    { path: '/', label: 'Trades', icon: TrendingUp },
    { path: '/create', label: 'Nuevo', icon: Plus },
    { path: '/notes', label: 'Notas', icon: BookOpen },
  ];

  const secondaryNav = [
    { path: '/stats', label: 'Estadísticas', icon: BarChart3 },
    { path: '/backtest', label: 'Backtesting', icon: FlaskConical },
  ];

  const isActive = (path) =>
    path === '/'
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(path + '/');

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
              Trading Journal
            </span>
          </Link>

          {/* Desktop nav — full */}
          <nav className="hidden sm:flex items-center space-x-1">
            {[...primaryNav, ...secondaryNav].map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isActive(path)
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                  }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {label}
              </Link>
            ))}

            <button
              onClick={toggleTheme}
              className="ml-2 p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="ml-2">
              <UserMenu />
            </div>
          </nav>

          {/* Mobile nav */}
          <div className="flex sm:hidden items-center gap-1" ref={menuRef}>
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
                  <UserMenu />
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
