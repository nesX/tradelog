import { sendSuccess, sendCreated, sendDeleted } from '../utils/response.js';
import * as dateReminderService from '../services/dateReminder.service.js';

export const getDateReminders = async (req, res) => {
  const data = await dateReminderService.listDateReminders(req.user.id, req.query.status);
  sendSuccess(res, data);
};

export const createDateReminder = async (req, res) => {
  const data = await dateReminderService.createDateReminder(req.user.id, req.body);
  sendCreated(res, data, 'Recordatorio creado');
};

export const updateDateReminder = async (req, res) => {
  const data = await dateReminderService.updateDateReminder(req.user.id, req.params.id, req.body);
  sendSuccess(res, data, 'Recordatorio actualizado');
};

export const deleteDateReminder = async (req, res) => {
  await dateReminderService.deleteDateReminder(req.user.id, req.params.id);
  sendDeleted(res, 'Recordatorio eliminado');
};
