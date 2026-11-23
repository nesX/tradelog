import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import * as pushService from '../services/push.service.js';

export const getConfig = async (req, res) => {
  sendSuccess(res, pushService.getConfig());
};

export const linkSubscription = async (req, res) => {
  await pushService.link(req.user.id, req.body);
  sendCreated(res, null, 'Dispositivo vinculado');
};

export const getSubscriptionStatus = async (req, res) => {
  const data = await pushService.status(req.user.id, req.body);
  sendSuccess(res, data);
};

export const unlinkSubscription = async (req, res) => {
  await pushService.unlink(req.user.id, req.body.endpoint);
  sendDeleted(res, 'Dispositivo desvinculado');
};

export const sendTest = async (req, res) => {
  const data = await pushService.sendTest(req.user.id, req.body.endpoint);
  sendSuccess(res, data, 'Notificación de prueba enviada');
};
