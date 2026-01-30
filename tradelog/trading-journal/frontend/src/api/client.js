import axios from 'axios';

// Crear instancia de axios configurada
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para requests
apiClient.interceptors.request.use(
  (config) => {
    // Aquí se pueden agregar tokens de autenticación en el futuro
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
    };

    if (error.response?.data?.error) {
      errorResponse.message = error.response.data.error.message;
      errorResponse.code = error.response.data.error.code;
      errorResponse.details = error.response.data.error.details;
    } else if (error.message) {
      errorResponse.message = error.message;
    }

    return Promise.reject(errorResponse);
  }
);

export default apiClient;
