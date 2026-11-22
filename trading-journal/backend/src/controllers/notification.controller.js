import { sendSuccess } from '../utils/response.js';
import * as notificationService from '../services/notification.service.js';

export const getNotifications = async (req, res) => {
  const data = await notificationService.listNotifications(req.user.id, req.query);
  sendSuccess(res, data);
};

export const getNotificationCount = async (req, res) => {
  const data = await notificationService.countOpen(req.user.id);
  sendSuccess(res, data);
};

export const resolveNotification = async (req, res) => {
  const data = await notificationService.resolveNotification(req.user.id, req.params.id, req.body);
  sendSuccess(res, data, 'Tarjeta archivada');
};
