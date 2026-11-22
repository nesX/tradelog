import { useQuery } from '@tanstack/react-query';
import { getMarketSymbols, getSymbolPrice } from '../api/endpoints.js';
import { marketSymbolKeys } from './reminderKeys.js';

export { marketSymbolKeys };

/** Catálogo de perpetuos (los usados por el usuario primero). Casi no cambia. */
export function useMarketSymbols({ enabled = true } = {}) {
  return useQuery({
    queryKey: marketSymbolKeys.list(),
    queryFn: getMarketSymbols,
    select: (response) => response.data,
    staleTime: 10 * 60_000,
    enabled,
  });
}

/**
 * Precio en vivo desde la caché del backend (60 s): aunque esto refresque cada
 * 30 s mientras el modal está abierto, Binance ve como mucho una petición por
 * minuto para toda la app. El navegador nunca llama a Binance.
 */
export function useSymbolPrice(symbol, { enabled = true } = {}) {
  return useQuery({
    queryKey: marketSymbolKeys.price(symbol),
    queryFn: () => getSymbolPrice(symbol),
    select: (response) => response.data,
    enabled: enabled && Boolean(symbol),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
