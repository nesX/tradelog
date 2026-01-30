import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';

/**
 * Hooks de React Query para trades
 */

// Keys para cache
export const tradeKeys = {
  all: ['trades'],
  lists: () => [...tradeKeys.all, 'list'],
  list: (filters) => [...tradeKeys.lists(), filters],
  details: () => [...tradeKeys.all, 'detail'],
  detail: (id) => [...tradeKeys.details(), id],
  symbols: () => [...tradeKeys.all, 'symbols'],
};

/**
 * Hook para obtener lista de trades
 */
export const useTrades = (filters = {}) => {
  return useQuery({
    queryKey: tradeKeys.list(filters),
    queryFn: () => api.getTrades(filters),
    staleTime: 30000, // 30 segundos
    select: (response) => response.data,
  });
};

/**
 * Hook para obtener un trade por ID
 */
export const useTrade = (id) => {
  return useQuery({
    queryKey: tradeKeys.detail(id),
    queryFn: () => api.getTradeById(id),
    enabled: !!id,
    select: (response) => response.data,
  });
};

/**
 * Hook para obtener símbolos únicos
 */
export const useSymbols = () => {
  return useQuery({
    queryKey: tradeKeys.symbols(),
    queryFn: () => api.getSymbols(),
    staleTime: 60000, // 1 minuto
    select: (response) => response.data.symbols,
  });
};

/**
 * Hook para crear un trade (con múltiples imágenes)
 */
export const useCreateTrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tradeData, imageFiles }) => api.createTrade(tradeData, imageFiles || []),
    onSuccess: () => {
      // Invalidar cache de trades
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tradeKeys.symbols() });
    },
  });
};

/**
 * Hook para actualizar un trade (con nuevas imágenes)
 */
export const useUpdateTrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updateData, imageFiles }) => api.updateTrade(id, updateData, imageFiles || []),
    onSuccess: (data, variables) => {
      // Invalidar cache del trade específico y la lista
      queryClient.invalidateQueries({ queryKey: tradeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
    },
  });
};

/**
 * Hook para eliminar un trade
 */
export const useDeleteTrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, permanent }) => api.deleteTrade(id, permanent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tradeKeys.symbols() });
    },
  });
};

/**
 * Hook para agregar imágenes a un trade existente
 */
export const useAddTradeImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tradeId, imageFiles }) => api.addTradeImages(tradeId, imageFiles),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tradeKeys.detail(variables.tradeId) });
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
    },
  });
};

/**
 * Hook para eliminar una imagen específica de un trade
 */
export const useDeleteTradeImage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tradeId, imageId }) => api.deleteTradeImage(tradeId, imageId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tradeKeys.detail(variables.tradeId) });
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
    },
  });
};

/**
 * Hook para eliminar todas las imágenes de un trade
 */
export const useDeleteAllTradeImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tradeId) => api.deleteAllTradeImages(tradeId),
    onSuccess: (data, tradeId) => {
      queryClient.invalidateQueries({ queryKey: tradeKeys.detail(tradeId) });
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
    },
  });
};

/**
 * Hook para preview de CSV
 */
export const usePreviewCSV = () => {
  return useMutation({
    mutationFn: (csvData) => api.previewCSVImport(csvData),
  });
};

/**
 * Hook para importar CSV
 */
export const useImportCSV = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (csvData) => api.importCSV(csvData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tradeKeys.symbols() });
    },
  });
};
