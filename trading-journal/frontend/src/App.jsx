import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { emitToast } from './utils/toastBridge.js';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ToastProvider } from './components/common/Toast.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import AdminRoute from './components/auth/AdminRoute.jsx';
import Users from './pages/admin/Users.jsx';
import Layout from './components/layout/Layout.jsx';
import Home from './pages/Home.jsx';
import CreateTrade from './pages/CreateTrade.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Backtest from './pages/Backtest.jsx';
import BacktestSession from './pages/BacktestSession.jsx';
import BacktestNew from './pages/BacktestNew.jsx';
import Notes from './pages/Notes.jsx';
import Review from './pages/Review.jsx';
import Repaso from './pages/Repaso.jsx';
import Todo from './pages/Todo.jsx';
import Reminders from './pages/Reminders.jsx';
import Search from './pages/Search.jsx';
import Tags from './pages/Tags.jsx';
import { usePushSync } from './hooks/usePushSubscription.js';
import { useServiceWorkerMessages } from './hooks/useServiceWorkerMessages.js';

// Configuración de React Query
const queryClient = new QueryClient({
  // Manejo global de errores de mutación: una sola pieza cubre toda la clase de
  // fallos silenciosos (crear/borrar/mover nota, renombrar, tags, etc.). Las
  // mutaciones con su propio feedback pueden optar por silenciarlo con
  // `meta: { silenceError: true }`.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation?.meta?.silenceError) return;
      // El interceptor de axios ya redirige a /login en 401: evitar toast redundante.
      if (error?.status === 401) return;
      emitToast('error', error?.message || 'Ocurrió un error. Intenta de nuevo.');
    },
  }),
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
 * Avisos push, una sola vez para toda la app (cada ruta tiene su propio Layout):
 *   - con sesión, sincroniza este dispositivo con la cuenta (usePushSync);
 *   - siempre, atiende los mensajes del service worker: tocar una notificación
 *     con la app abierta navega aunque se esté en /login (ProtectedRoute vuelve
 *     después del login).
 */
function PushBridge() {
  const { isAuthenticated, user } = useAuth();
  usePushSync(isAuthenticated ? user?.id : null);
  useServiceWorkerMessages();
  return null;
}

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
              <PushBridge />
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
                  path="/notes"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Notes />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/notes/:id"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Notes />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/review"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Review />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/repaso"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Repaso />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/todo"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Todo />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/todo/:listId"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Todo />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/recordatorios"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Reminders />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/buscar"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Search />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tags"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Tags />
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
                <Route
                  path="/admin/users"
                  element={
                    <AdminRoute>
                      <Layout>
                        <Users />
                      </Layout>
                    </AdminRoute>
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
