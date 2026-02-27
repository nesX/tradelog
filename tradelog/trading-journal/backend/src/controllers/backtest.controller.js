import * as service from '../services/backtest.service.js';
import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';

export const listSessions = async (req, res) => {
  const sessions = await service.getSessions(req.user.id);
  sendSuccess(res, sessions);
};

export const getSession = async (req, res) => {
  const session = await service.getSession(req.user.id, parseInt(req.params.id, 10));
  sendSuccess(res, session);
};

export const createSession = async (req, res) => {
  const session = await service.createSession(req.user.id, req.body);
  sendCreated(res, session, 'Sesión de backtesting creada');
};

export const closeSession = async (req, res) => {
  const session = await service.closeSession(req.user.id, parseInt(req.params.id, 10), req.body);
  sendSuccess(res, session, 'Sesión cerrada');
};

export const getContinuationData = async (req, res) => {
  const data = await service.getSessionForContinuation(req.user.id, parseInt(req.params.id, 10));
  sendSuccess(res, data);
};

export const addTrade = async (req, res) => {
  const trade = await service.addTrade(req.user.id, parseInt(req.params.id, 10), req.body);
  sendCreated(res, trade, 'Trade registrado');
};

export const deleteTrade = async (req, res) => {
  await service.deleteTrade(req.user.id, parseInt(req.params.tradeId, 10));
  sendDeleted(res, 'Trade eliminado');
};
