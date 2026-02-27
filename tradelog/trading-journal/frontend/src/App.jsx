import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './components/common/Toast.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import Layout from './components/layout/Layout.jsx';
import Home from './pages/Home.jsx';
import CreateTrade from './pages/CreateTrade.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Backtest from './pages/Backtest.jsx';
import BacktestSession from './pages/BacktestSession.jsx';
import BacktestNew from './pages/BacktestNew.jsx';

// Configuración de React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 segundos
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Componente principal de la aplicación
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                {/* Ruta pública */}
                <Route path="/login" element={<Login />} />

                {/* Rutas protegidas */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Home />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/create"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <CreateTrade />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/stats"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Stats />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Settings />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/backtest"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Backtest />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/backtest/new"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <BacktestNew />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/backtest/:id"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <BacktestSession />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/backtest/:id/continue"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <BacktestNew />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
