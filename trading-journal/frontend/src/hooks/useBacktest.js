import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';

export const backtestKeys = {
  all: ['backtest'],
  sessions: () => [...backtestKeys.all, 'sessions'],
  session: (id) => [...backtestKeys.all, 'sessions', id],
};

export const useSessions = () => {
  return useQuery({
    queryKey: backtestKeys.sessions(),
    queryFn: () => api.getSessions(),
    staleTime: 30000,
    select: (response) => response.data,
  });
};

export const useSession = (id) => {
  return useQuery({
    queryKey: backtestKeys.session(id),
    queryFn: () => api.getSession(id),
    enabled: !!id,
    staleTime: 0,
    select: (response) => response.data,
  });
};

export const useCreateSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backtestKeys.sessions() });
    },
  });
};

export const useCloseSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.closeSession(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: backtestKeys.session(variables.id) });
      queryClient.invalidateQueries({ queryKey: backtestKeys.sessions() });
    },
  });
};

export const useAddTrade = (sessionId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageFile, ...data }) => api.addBacktestTrade(sessionId, data, imageFile),
    onMutate: async (newTrade) => {
      await queryClient.cancelQueries({ queryKey: backtestKeys.session(sessionId) });
      const previous = queryClient.getQueryData(backtestKeys.session(sessionId));

      queryClient.setQueryData(backtestKeys.session(sessionId), (old) => {
        if (!old) return old;
        const optimisticTrade = {
          id: Date.now(),
          result: newTrade.result,
          comment: newTrade.comment,
          image_filename: null,
          created_at: new Date().toISOString(),
          _optimistic: true,
        };
        const updatedTrades = [...(old.trades || []), optimisticTrade];
        const totals = countTrades(updatedTrades);
        return { ...old, trades: updatedTrades, ...totals };
      });

      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(backtestKeys.session(sessionId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: backtestKeys.session(sessionId) });
    },
  });
};

export const useDeleteTradeImage = (sessionId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tradeId) => api.deleteBacktestTradeImage(tradeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backtestKeys.session(sessionId) });
    },
  });
};

export const useDeleteTrade = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId }) => api.deleteBacktestTrade(tradeId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: backtestKeys.session(variables.sessionId) });
    },
  });
};

export const useUpdateComment = (sessionId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comment) => api.updateBacktestComment(sessionId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backtestKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: backtestKeys.sessions() });
    },
  });
};

// Helper para recalcular contadores optimistas
const countTrades = (trades) => {
  const long_wins = trades.filter((t) => t.result === 'long_win').length;
  const long_losses = trades.filter((t) => t.result === 'long_loss').length;
  const short_wins = trades.filter((t) => t.result === 'short_win').length;
  const short_losses = trades.filter((t) => t.result === 'short_loss').length;
  const break_evens = trades.filter((t) => t.result === 'break_even').length;
  const total_trades = trades.length;
  const wins = long_wins + short_wins;
  const win_rate = total_trades > 0 ? Math.round((wins / total_trades) * 1000) / 10 : null;
  return { total_trades, long_wins, long_losses, short_wins, short_losses, break_evens, win_rate };
};
