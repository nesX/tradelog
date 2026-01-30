import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';

/**
 * Hooks de React Query para estadísticas
 */

// Keys para cache
export const statsKeys = {
  all: ['stats'],
  general: () => [...statsKeys.all, 'general'],
  bySymbol: () => [...statsKeys.all, 'by-symbol'],
  byDateRange: (from, to) => [...statsKeys.all, 'by-date', { from, to }],
  dailyPnL: (days) => [...statsKeys.all, 'daily-pnl', days],
  byType: () => [...statsKeys.all, 'by-type'],
  topTrades: (limit) => [...statsKeys.all, 'top-trades', limit],
};

/**
 * Hook para estadísticas generales
 */
export const useStats = () => {
  return useQuery({
    queryKey: statsKeys.general(),
    queryFn: () => api.getStats(),
    staleTime: 30000,
    select: (response) => response.data,
  });
};

/**
 * Hook para estadísticas por símbolo
 */
export const useStatsBySymbol = () => {
  return useQuery({
    queryKey: statsKeys.bySymbol(),
    queryFn: () => api.getStatsBySymbol(),
    staleTime: 30000,
    select: (response) => response.data.symbols,
  });
};

/**
 * Hook para estadísticas por rango de fechas
 */
export const useStatsByDateRange = (dateFrom, dateTo) => {
  return useQuery({
    queryKey: statsKeys.byDateRange(dateFrom, dateTo),
    queryFn: () => api.getStatsByDateRange(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
    staleTime: 30000,
    select: (response) => response.data,
  });
};

/**
 * Hook para P&L diario
 */
export const useDailyPnL = (days = 30) => {
  return useQuery({
    queryKey: statsKeys.dailyPnL(days),
    queryFn: () => api.getDailyPnL(days),
    staleTime: 60000,
    select: (response) => response.data.dailyPnL,
  });
};

/**
 * Hook para estadísticas por tipo de trade
 */
export const useStatsByType = () => {
  return useQuery({
    queryKey: statsKeys.byType(),
    queryFn: () => api.getStatsByType(),
    staleTime: 30000,
    select: (response) => response.data,
  });
};

/**
 * Hook para mejores y peores trades
 */
export const useTopTrades = (limit = 5) => {
  return useQuery({
    queryKey: statsKeys.topTrades(limit),
    queryFn: () => api.getTopTrades(limit),
    staleTime: 30000,
    select: (response) => response.data,
  });
};
