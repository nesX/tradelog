/**
 * Destino tras el login (`?next=`) o al tocar una notificación. Solo rutas de la
 * propia app: nunca una redirección abierta.
 *
 *   - Tiene que empezar por `/` y no por `//` ni por `/\` (los navegadores
 *     convierten `\` en `/`, así que `/\evil.com` acaba en `//evil.com`).
 *   - Resuelta contra el origin de la app, tiene que quedarse en ese origin
 *     (cubre también tabuladores y saltos de línea que el parser de URL elimina).
 *   - Si no pasa, `/`.
 */
export const safeNext = (next, origin = globalThis.location?.origin) => {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/';
  }
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin || url.pathname === '/login') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
};
