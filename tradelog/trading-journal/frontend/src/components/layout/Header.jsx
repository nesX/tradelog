import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, BarChart3, Plus } from 'lucide-react';

/**
 * Componente Header de la aplicación
 */
const Header = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Trades', icon: TrendingUp },
    { path: '/stats', label: 'Estadísticas', icon: BarChart3 },
    { path: '/create', label: 'Nuevo Trade', icon: Plus },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">
              Trading Journal
            </span>
          </Link>

          {/* Navegación */}
          <nav className="flex items-center space-x-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
