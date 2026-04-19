import axios from 'axios';

// Crear instancia de axios configurada
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para requests - agregar token de autenticación
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para responses
apiClient.interceptors.response.use(
  (response) => {
    // Extraer data del wrapper de respuesta
    return response.data;
  },
  (error) => {
    // Formatear error para uso consistente
    const errorResponse = {
      message: 'Error de conexión',
      code: 'NETWORK_ERROR',
      details: null,
      status: error.response?.status,
    };

    if (error.response?.data?.error) {
      errorResponse.message = error.response.data.error.message;
      errorResponse.code = error.response.data.error.code;
      errorResponse.details = error.response.data.error.details;
    } else if (error.message) {
      errorResponse.message = error.message;
    }

    // Si es error 401, limpiar token (sesión expirada)
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Redirigir a login si no estamos ya ahí
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(errorResponse);
  }
);

export default apiClient;
