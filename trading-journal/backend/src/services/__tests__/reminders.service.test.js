import { jest } from '@jest/globals';

/**
 * Alertas de precio, recordatorios por fecha y bandeja, con repositorios y caché
 * de precios mockeados (sin BD ni red).
 */

const mockAlertRepo = {
  findByIdAndUser: jest.fn(),
  listByUser: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  deleteByIds: jest.fn(),
  hasActiveForSymbol: jest.fn(),
  findActiveByAnchor: jest.fn(),
};
const mockReminderRepo = {
  findByIdAndUser: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  deleteById: jest.fn(),
};
const mockSymbolRepo = { findBySymbol: jest.fn(), setCheckedUntil: jest.fn() };
const mockNotificationRepo = {
  resolveOpenByAlerts: jest.fn(),
  resolveOpenByReminder: jest.fn(),
  findByIdAndUser: jest.fn(),
  resolve: jest.fn(),
  listResolved: jest.fn(),
  listOpen: jest.fn(),
};
const mockNoteRepo = { findBlockByIdAndUser: jest.fn(), findNoteByIdAndUser: jest.fn() };
const mockGetPrice = jest.fn();
const mockClient = { query: jest.fn() };

jest.unstable_mockModule('../../repositories/priceAlert.repository.js', () => mockAlertRepo);
jest.unstable_mockModule('../../repositories/dateReminder.repository.js', () => mockReminderRepo);
jest.unstable_mockModule('../../repositories/marketSymbol.repository.js', () => mockSymbolRepo);
jest.unstable_mockModule('../../repositories/notification.repository.js', () => mockNotificationRepo);
jest.unstable_mockModule('../../repositories/note.repository.js', () => mockNoteRepo);
jest.unstable_mockModule('../marketPrice.service.js', () => ({ getPrice: mockGetPrice }));
jest.unstable_mockModule('../../config/database.js', () => ({
  withTransaction: (fn) => fn(mockClient),
}));

const { createPriceAlert, updatePriceAlert, deletePriceAlert } = await import('../priceAlert.service.js');
const { createDateReminder, updateDateReminder, deleteDateReminder } = await import('../dateReminder.service.js');
const { resolveNotification, listNotifications, RESOLVED_PAGE_SIZE } = await import('../notification.service.js');
const { NotFoundError, ValidationError } = await import('../../middleware/errorHandler.js');

const storedAlert = (overrides = {}) => ({
  id: 5,
  user_id: 1,
  symbol: 'BTCUSDT',
  direction: 'below',
  target_price: 60000,
  is_invalidation: false,
  near_pct: 3,
  deadline_at: null,
  status: 'active',
  note_id: 10,
  block_id: 20,
  anchor_content: 'texto',
  last_price: 90000,
  ...overrides,
});

const alertInput = (overrides = {}) => ({
  block_id: 20,
  symbol: 'BTCUSDT',
  target_price: 60000,
  direction: 'below',
  is_invalidation: false,
  near_pct: 3,
  deadline_at: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockNoteRepo.findBlockByIdAndUser.mockResolvedValue({ id: 20, note_id: 10 });
  mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 10, type: 'note' });
  mockSymbolRepo.findBySymbol.mockResolvedValue({ symbol: 'BTCUSDT', invalid_at: null });
  mockGetPrice.mockResolvedValue({ price: 90000, as_of: '2027-03-01T10:00:00Z' });
  mockAlertRepo.hasActiveForSymbol.mockResolvedValue(true);
  mockAlertRepo.insert.mockResolvedValue(5);
  mockAlertRepo.findByIdAndUser.mockResolvedValue(storedAlert());
  mockReminderRepo.insert.mockResolvedValue(9);
  mockReminderRepo.findByIdAndUser.mockResolvedValue({ id: 9, remind_at: '2027-03-01T13:00:00Z', status: 'pending' });
});

describe('createPriceAlert', () => {
  it('símbolo deslistado → ValidationError sin insertar', async () => {
    mockSymbolRepo.findBySymbol.mockResolvedValue({ symbol: 'BTCUSDT', invalid_at: '2027-01-01' });

    await expect(createPriceAlert(1, alertInput())).rejects.toThrow('Símbolo no disponible en Binance Futures');
    expect(mockAlertRepo.insert).not.toHaveBeenCalled();
  });

  it('símbolo fuera del catálogo → ValidationError', async () => {
    mockSymbolRepo.findBySymbol.mockResolvedValue(null);
    await expect(createPriceAlert(1, alertInput())).rejects.toBeInstanceOf(ValidationError);
  });

  it('precio ya dentro de la banda de aviso → near_at relleno', async () => {
    mockGetPrice.mockResolvedValue({ price: 61000 }); // banda below 60000 × 1.03 = 61800

    await createPriceAlert(1, alertInput());

    const inserted = mockAlertRepo.insert.mock.calls[0][0];
    expect(inserted.near_at).toBeInstanceOf(Date);
    expect(inserted.price_at_creation).toBe(61000);
    expect(inserted).toMatchObject({ user_id: 1, block_id: 20, note_id: null });
  });

  it('precio fuera de la banda → near_at NULL; sin precio → price_at_creation NULL', async () => {
    await createPriceAlert(1, alertInput());
    expect(mockAlertRepo.insert.mock.calls[0][0].near_at).toBeNull();

    mockGetPrice.mockResolvedValue({ price: null });
    await createPriceAlert(1, alertInput());
    expect(mockAlertRepo.insert.mock.calls[1][0]).toMatchObject({ near_at: null, price_at_creation: null });
  });

  it('resetea checked_until solo si el símbolo no tiene otras alertas activas', async () => {
    await createPriceAlert(1, alertInput());
    expect(mockSymbolRepo.setCheckedUntil).not.toHaveBeenCalled();

    mockAlertRepo.hasActiveForSymbol.mockResolvedValue(false);
    await createPriceAlert(1, alertInput());
    const [symbol, checkedUntil] = mockSymbolRepo.setCheckedUntil.mock.calls[0];
    expect(symbol).toBe('BTCUSDT');
    expect(checkedUntil.getTime() % 3_600_000).toBe(0);
    expect(Date.now() - checkedUntil.getTime()).toBeLessThan(3_600_000);
  });

  it('anclaje a una sección o a la nota oculta de un pendiente → ValidationError', async () => {
    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 10, type: 'todo' });
    await expect(createPriceAlert(1, alertInput())).rejects.toBeInstanceOf(ValidationError);

    mockNoteRepo.findNoteByIdAndUser.mockResolvedValue({ id: 11, type: 'section' });
    await expect(createPriceAlert(1, alertInput({ block_id: undefined, note_id: 11 }))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(mockAlertRepo.insert).not.toHaveBeenCalled();
  });

  it('bloque ajeno o borrado → NotFoundError', async () => {
    mockNoteRepo.findBlockByIdAndUser.mockResolvedValue(null);
    await expect(createPriceAlert(1, alertInput())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updatePriceAlert', () => {
  it('cambiar el nivel re-arma y resuelve sus tarjetas como rearmed', async () => {
    await updatePriceAlert(1, 5, { target_price: 58000 });

    expect(mockNotificationRepo.resolveOpenByAlerts).toHaveBeenCalledWith([5], 'rearmed', mockClient);
    const fields = mockAlertRepo.update.mock.calls[0][1];
    expect(fields).toMatchObject({ target_price: 58000, status: 'active', triggered_at: null, price_at_creation: 90000 });
    expect(fields.armed_at).toBeInstanceOf(Date);
    expect(mockAlertRepo.findByIdAndUser).toHaveBeenCalledWith(5, 1, mockClient, { forUpdate: true });
  });

  it('re-armar una alerta disparada al mismo nivel también re-arma', async () => {
    mockAlertRepo.findByIdAndUser.mockResolvedValue(storedAlert({ status: 'triggered' }));
    mockAlertRepo.hasActiveForSymbol.mockResolvedValue(false);

    await updatePriceAlert(1, 5, { target_price: 60000, direction: 'below' });

    expect(mockAlertRepo.update.mock.calls[0][1].status).toBe('active');
    expect(mockSymbolRepo.setCheckedUntil).toHaveBeenCalled();
  });

  it('cambiar la fecha límite resuelve solo las de fecha límite como updated', async () => {
    const deadline = new Date('2027-06-30T05:00:00Z');
    await updatePriceAlert(1, 5, { deadline_at: deadline });

    expect(mockNotificationRepo.resolveOpenByAlerts).toHaveBeenCalledTimes(1);
    expect(mockNotificationRepo.resolveOpenByAlerts).toHaveBeenCalledWith([5], 'updated', mockClient, {
      types: ['price_alert_deadline'],
    });
    expect(mockAlertRepo.update.mock.calls[0][1]).toEqual({ deadline_at: deadline });
    expect(mockGetPrice).not.toHaveBeenCalled();
  });

  it('cambiar solo el mensaje o el aviso previo no toca las tarjetas', async () => {
    await updatePriceAlert(1, 5, { message: '  nuevo  ', near_pct: 5 });

    expect(mockNotificationRepo.resolveOpenByAlerts).not.toHaveBeenCalled();
    expect(mockAlertRepo.update.mock.calls[0][1]).toEqual({ near_pct: 5, message: 'nuevo' });
  });

  it('el mismo nivel en una alerta activa no re-arma', async () => {
    await updatePriceAlert(1, 5, { target_price: 60000 });
    expect(mockNotificationRepo.resolveOpenByAlerts).not.toHaveBeenCalled();
    expect(mockAlertRepo.update.mock.calls[0][1].status).toBeUndefined();
  });

  it('alerta de otro usuario → NotFoundError', async () => {
    mockAlertRepo.findByIdAndUser.mockResolvedValue(null);
    await expect(updatePriceAlert(2, 5, { message: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deletePriceAlert / recordatorios por fecha', () => {
  it('borrar una alerta resuelve sus tarjetas como dismissed antes de borrarla', async () => {
    await deletePriceAlert(1, 5);

    expect(mockNotificationRepo.resolveOpenByAlerts).toHaveBeenCalledWith([5], 'dismissed', mockClient);
    expect(mockAlertRepo.deleteByIds).toHaveBeenCalledWith([5], mockClient);
    const resolveOrder = mockNotificationRepo.resolveOpenByAlerts.mock.invocationCallOrder[0];
    expect(resolveOrder).toBeLessThan(mockAlertRepo.deleteByIds.mock.invocationCallOrder[0]);
  });

  it('crear un recordatorio de nota lo ancla a la nota', async () => {
    await createDateReminder(1, { note_id: 10, remind_at: new Date('2027-03-01T13:00:00Z'), message: '' });
    expect(mockReminderRepo.insert.mock.calls[0][0]).toMatchObject({ note_id: 10, block_id: null, message: null });
  });

  it('una fecha nueva re-programa y resuelve sus tarjetas como rearmed', async () => {
    await updateDateReminder(1, 9, { remind_at: new Date('2027-04-01T13:00:00Z') });

    expect(mockReminderRepo.update.mock.calls[0][1].reschedule).toBe(true);
    expect(mockNotificationRepo.resolveOpenByReminder).toHaveBeenCalledWith(9, 'rearmed', mockClient);
  });

  it('cambiar solo el mensaje no re-programa', async () => {
    await updateDateReminder(1, 9, { message: 'otro' });
    expect(mockReminderRepo.update.mock.calls[0][1].reschedule).toBe(false);
    expect(mockNotificationRepo.resolveOpenByReminder).not.toHaveBeenCalled();
  });

  it('borrar un recordatorio resuelve sus tarjetas como dismissed', async () => {
    await deleteDateReminder(1, 9);
    expect(mockNotificationRepo.resolveOpenByReminder).toHaveBeenCalledWith(9, 'dismissed', mockClient);
    expect(mockReminderRepo.deleteById).toHaveBeenCalledWith(9, mockClient);
  });
});

describe('notification.service', () => {
  const card = (overrides = {}) => ({
    id: 30,
    type: 'price_alert_invalidation',
    price_alert_id: 5,
    resolved_at: null,
    note_id: 10,
    block_id: 20,
    payload: { note_id: 10, block_id: 20 },
    ...overrides,
  });

  it('resolve sobre una tarjeta ajena → NotFoundError', async () => {
    mockNotificationRepo.findByIdAndUser.mockResolvedValue(null);
    await expect(resolveNotification(2, 30, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolve de una tarjeta ya resuelta la devuelve sin error (doble clic)', async () => {
    const resolved = card({ resolved_at: '2027-03-01T10:00:00Z' });
    mockNotificationRepo.findByIdAndUser.mockResolvedValue(resolved);

    expect(await resolveNotification(1, 30, { resolution: 'dismissed' })).toBe(resolved);
    expect(mockNotificationRepo.resolve).not.toHaveBeenCalled();
  });

  it('delete_sibling_alerts en una tarjeta que no es de invalidación → ValidationError', async () => {
    mockNotificationRepo.findByIdAndUser.mockResolvedValue(card({ type: 'price_alert_hit' }));
    await expect(resolveNotification(1, 30, { delete_sibling_alerts: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it('delete_sibling_alerts borra las demás alertas activas del bloque y resuelve sus tarjetas', async () => {
    mockNotificationRepo.findByIdAndUser.mockResolvedValue(card());
    mockAlertRepo.findActiveByAnchor.mockResolvedValue([{ id: 6 }, { id: 7 }]);

    await resolveNotification(1, 30, { resolution: 'dismissed', delete_sibling_alerts: true });

    expect(mockAlertRepo.findActiveByAnchor).toHaveBeenCalledWith(1, { blockId: 20, noteId: null }, 5, mockClient);
    expect(mockNotificationRepo.resolveOpenByAlerts).toHaveBeenCalledWith([6, 7], 'dismissed', mockClient);
    expect(mockAlertRepo.deleteByIds).toHaveBeenCalledWith([6, 7], mockClient);
    expect(mockNotificationRepo.resolve).toHaveBeenCalledWith(30, 'dismissed', mockClient);
  });

  it('si la alerta pasó a la nota (bloque borrado) usa el anclaje de nota', async () => {
    mockNotificationRepo.findByIdAndUser.mockResolvedValue(card({ block_id: null }));
    mockAlertRepo.findActiveByAnchor.mockResolvedValue([]);

    await resolveNotification(1, 30, { delete_sibling_alerts: true });

    expect(mockAlertRepo.findActiveByAnchor).toHaveBeenCalledWith(1, { blockId: null, noteId: 10 }, 5, mockClient);
  });

  it('historial: next_before solo si la página viene llena', async () => {
    const full = Array.from({ length: RESOLVED_PAGE_SIZE }, (_, i) => ({ id: 100 - i }));
    mockNotificationRepo.listResolved.mockResolvedValue(full);
    expect((await listNotifications(1, { status: 'resolved' })).next_before).toBe(100 - RESOLVED_PAGE_SIZE + 1);

    mockNotificationRepo.listResolved.mockResolvedValue(full.slice(0, 3));
    expect((await listNotifications(1, { status: 'resolved', before: 51 })).next_before).toBeNull();
    expect(mockNotificationRepo.listResolved).toHaveBeenLastCalledWith(1, 51, RESOLVED_PAGE_SIZE);
  });
});
