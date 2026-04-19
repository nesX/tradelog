import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

/**
 * Provider para manejar el tema (dark/light mode)
 */
export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // Verificar localStorage primero
    const saved = localStorage.getItem('theme');
    if (saved) {
      return saved === 'dark';
    }
    // Si no hay preferencia guardada, usar preferencia del sistema
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Aplicar clase dark al documento
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Escuchar cambios en la preferencia del sistema
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Solo cambiar si no hay preferencia guardada
      if (!localStorage.getItem('theme')) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook para usar el contexto de tema
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return context;
};
