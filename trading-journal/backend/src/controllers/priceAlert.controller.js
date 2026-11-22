import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import * as priceAlertService from '../services/priceAlert.service.js';

export const getPriceAlerts = async (req, res) => {
  const data = await priceAlertService.listPriceAlerts(req.user.id, req.query.status);
  sendSuccess(res, data);
};

export const createPriceAlert = async (req, res) => {
  const data = await priceAlertService.createPriceAlert(req.user.id, req.body);
  sendCreated(res, data, 'Alerta creada');
};

export const updatePriceAlert = async (req, res) => {
  const data = await priceAlertService.updatePriceAlert(req.user.id, req.params.id, req.body);
  sendSuccess(res, data, 'Alerta actualizada');
};

export const deletePriceAlert = async (req, res) => {
  await priceAlertService.deletePriceAlert(req.user.id, req.params.id);
  sendDeleted(res, 'Alerta eliminada');
};
