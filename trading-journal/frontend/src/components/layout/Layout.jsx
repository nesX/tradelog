import Header from './Header.jsx';

/**
 * Componente Layout principal
 */
const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer simple */}
      <footer className="mt-auto py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Trading Journal - {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default Layout;
