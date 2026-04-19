import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginWithGoogle as apiLoginWithGoogle, getCurrentUser } from '../api/endpoints.js';

const AuthContext = createContext();

/**
 * Provider para manejar la autenticación
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Verificar token al cargar
  useEffect(() => {
    const verifyToken = async () => {
      const savedToken = localStorage.getItem('token');

      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await getCurrentUser();
        setUser(response.data);
        setToken(savedToken);
        setIsAuthenticated(true);
      } catch (error) {
        // Token inválido o expirado
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, []);

  /**
   * Login con Google
   * @param {string} idToken - Token de Google
   */
  const loginWithGoogle = useCallback(async (idToken) => {
    try {
      const response = await apiLoginWithGoogle(idToken);
      const { user: userData, token: authToken } = response.data;

      localStorage.setItem('token', authToken);
      setToken(authToken);
      setUser(userData);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      // Mensaje más amigable para usuario no autorizado
      let errorMessage = error.message || 'Error al iniciar sesión';
      if (error.code === 'USER_NOT_AUTHORIZED') {
        errorMessage = 'Tu cuenta no está autorizada para acceder. Contacta al administrador.';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  /**
   * Cerrar sesión
   */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated,
    loginWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook para usar el contexto de autenticación
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
