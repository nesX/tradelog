// Puente imperativo hacia el sistema de toast (que vive en un contexto de React).
// Permite que código fuera del árbol de componentes —p. ej. el MutationCache del
// QueryClient, creado a nivel de módulo— dispare toasts.
//
// El ToastProvider registra su handler al montar; emitToast es un no-op hasta
// entonces (y si nadie lo registró, falla en silencio en vez de romper).

let handler = null;

export const registerToastHandler = (fn) => {
  handler = fn;
};

export const emitToast = (type, message) => {
  if (handler) handler(type, message);
};
