import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/common/Toast.jsx';
import Layout from './components/layout/Layout.jsx';
import Home from './pages/Home.jsx';
import CreateTrade from './pages/CreateTrade.jsx';
import Stats from './pages/Stats.jsx';

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
      <ToastProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateTrade />} />
              <Route path="/stats" element={<Stats />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
