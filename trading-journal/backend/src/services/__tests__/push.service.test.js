import { jest } from '@jest/globals';

/**
 * Avisos push: vinculación de dispositivos, prueba y envío de las tarjetas nuevas
 * (marca de agua), con el cliente de Web Push y los repositorios mockeados (sin
 * BD ni red).
 */

class MockPushGoneError extends Error {
  constructor(status) {
    super(`gone ${status}`);
    this.status = status;
  }
}
class MockPushRejectedError extends Error {
  constructor(status) {
    super(`rejected ${status}`);
    this.status = status;
  }
}

const mockWebPush = {
  isEnabled: jest.fn(),
  getPublicKey: jest.fn(),
  send: jest.fn(),
  endpointHost: (endpoint) => new URL(endpoint).hostname,
  PushGoneError: MockPushGoneError,
  PushRejectedError: MockPushRejectedError,
};
const mockSubscriptionRepo = {
  link: jest.fn(),
  checkIn: jest.fn(),
  deleteByEndpoint: jest.fn(),
  findByEndpoint: jest.fn(),
  findByUserIds: jest.fn(),
  deleteByEndpoints: jest.fn(),
};
const mockNotificationRepo = { findCreatedAfter: jest.fn(), maxId: jest.fn() };
const mockJobStateRepo = { get: jest.fn(), setPushNotifiedId: jest.fn() };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule('../../clients/webPush.js', () => mockWebPush);
jest.unstable_mockModule('../../repositories/pushSubscription.repository.js', () => mockSubscriptionRepo);
jest.unstable_mockModule('../../repositories/notification.repository.js', () => mockNotificationRepo);
jest.unstable_mockModule('../../repositories/reminderJobState.repository.js', () => mockJobStateRepo);
jest.unstable_mockModule('../../utils/logger.js', () => ({ logger: mockLogger }));

const pushService = await import('../push.service.js');
const { NotFoundError } = await import('../../middleware/errorHandler.js');

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const BODY = { endpoint: ENDPOINT, keys: { p256dh: 'BPk', auth: 'aut' }, user_agent: 'Chrome Linux' };
const ROW = { id: 1, user_id: 7, endpoint: ENDPOINT, p256dh: 'BPk', auth: 'aut' };

beforeEach(() => {
  jest.clearAllMocks();
  mockWebPush.isEnabled.mockReturnValue(true);
  mockWebPush.getPublicKey.mockReturnValue('PUBLIC');
});

describe('allowlist de endpoints', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx3abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (endpoint) => {
    expect(pushService.isAllowedEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['un host que solo empieza como uno permitido', 'https://fcm.googleapis.com.evil.com/fcm/send/abc'],
    ['http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['el host permitido en la ruta', 'https://evil.com/fcm.googleapis.com/'],
    ['un sufijo sin el punto', 'https://evilpush.apple.com/abc'],
    ['el dominio del sufijo a secas', 'https://push.apple.com/abc'],
    ['otro puerto', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['un servicio interno', 'https://localhost/fcm/send'],
    ['algo que no es una URL', 'fcm.googleapis.com/fcm/send/abc'],
  ])('rechaza %s', (_name, endpoint) => {
    expect(pushService.isAllowedEndpoint(endpoint)).toBe(false);
  });
});

describe('getConfig', () => {
  it('devuelve si está activado y la clave pública', () => {
    expect(pushService.getConfig()).toEqual({ enabled: true, public_key: 'PUBLIC' });
  });

  it('desactivado → public_key null', () => {
    mockWebPush.isEnabled.mockReturnValue(false);
    mockWebPush.getPublicKey.mockReturnValue(null);

    expect(pushService.getConfig()).toEqual({ enabled: false, public_key: null });
  });
});

describe('link', () => {
  it('vincula el dispositivo a la cuenta', async () => {
    await pushService.link(7, BODY);

    expect(mockSubscriptionRepo.link).toHaveBeenCalledWith({
      userId: 7,
      endpoint: ENDPOINT,
      p256dh: 'BPk',
      auth: 'aut',
      userAgent: 'Chrome Linux',
    });
  });

  it('con el push desactivado → 409 PUSH_DISABLED', async () => {
    mockWebPush.isEnabled.mockReturnValue(false);

    await expect(pushService.link(7, BODY)).rejects.toMatchObject({ statusCode: 409, code: 'PUSH_DISABLED' });
    expect(mockSubscriptionRepo.link).not.toHaveBeenCalled();
  });

  it('endpoint fuera de la allowlist → 400 sin tocar la BD, y se loguea solo el host', async () => {
    const endpoint = 'https://fcm.googleapis.com.evil.com/fcm/send/secreto';

    await expect(pushService.link(7, { ...BODY, endpoint })).rejects.toMatchObject({
      statusCode: 400,
      code: 'PUSH_ENDPOINT_NOT_ALLOWED',
    });
    expect(mockSubscriptionRepo.link).not.toHaveBeenCalled();
    expect(mockLogger.warn.mock.calls[0][0]).toContain('fcm.googleapis.com.evil.com');
    expect(mockLogger.warn.mock.calls[0][0]).not.toContain('secreto');
  });
});

describe('status', () => {
  it('fila propia → linked: true', async () => {
    mockSubscriptionRepo.checkIn.mockResolvedValue({ linked: true, unlinkedUserIds: [] });

    await expect(pushService.status(7, BODY)).resolves.toEqual({ linked: true });
    expect(mockSubscriptionRepo.checkIn).toHaveBeenCalledWith({
      userId: 7,
      endpoint: ENDPOINT,
      p256dh: 'BPk',
      auth: 'aut',
      userAgent: 'Chrome Linux',
    });
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('fila de otra cuenta → la desvincula, linked: false y log con los ids (sin el endpoint)', async () => {
    mockSubscriptionRepo.checkIn.mockResolvedValue({ linked: false, unlinkedUserIds: [3] });

    await expect(pushService.status(7, BODY)).resolves.toEqual({ linked: false });
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0][0]).toContain('cuenta 3');
    expect(mockLogger.info.mock.calls[0][0]).toContain('cuenta 7');
    expect(mockLogger.info.mock.calls[0][0]).not.toContain(ENDPOINT);
  });

  it('sin fila → linked: false y nunca vincula', async () => {
    mockSubscriptionRepo.checkIn.mockResolvedValue({ linked: false, unlinkedUserIds: [] });

    await expect(pushService.status(7, BODY)).resolves.toEqual({ linked: false });
    expect(mockSubscriptionRepo.link).not.toHaveBeenCalled();
  });
});

describe('unlink', () => {
  it('borra solo la fila de la cuenta', async () => {
    await pushService.unlink(7, ENDPOINT);

    expect(mockSubscriptionRepo.deleteByEndpoint).toHaveBeenCalledWith(7, ENDPOINT);
  });
});

describe('sendTest', () => {
  beforeEach(() => {
    mockSubscriptionRepo.findByEndpoint.mockResolvedValue(ROW);
  });

  it('entregada → { delivered: true }, mensaje de prueba sin topic', async () => {
    mockWebPush.send.mockResolvedValue();

    await expect(pushService.sendTest(7, ENDPOINT)).resolves.toEqual({ delivered: true });
    const [subscription, message, options] = mockWebPush.send.mock.calls[0];
    expect(subscription).toBe(ROW);
    expect(message).toMatchObject({ v: 1, kind: 'test' });
    expect(Number.isNaN(Date.parse(message.created_at))).toBe(false);
    expect(options).toEqual({ ttl: 300, topic: null });
    expect(mockSubscriptionRepo.findByEndpoint).toHaveBeenCalledWith(7, ENDPOINT);
  });

  it('con el push desactivado → 409', async () => {
    mockWebPush.isEnabled.mockReturnValue(false);

    await expect(pushService.sendTest(7, ENDPOINT)).rejects.toMatchObject({ statusCode: 409, code: 'PUSH_DISABLED' });
  });

  it('dispositivo no vinculado a la cuenta → 404', async () => {
    mockSubscriptionRepo.findByEndpoint.mockResolvedValue(null);

    await expect(pushService.sendTest(7, ENDPOINT)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockWebPush.send).not.toHaveBeenCalled();
  });

  it('410 → borra la fila y responde 410 PUSH_SUBSCRIPTION_GONE', async () => {
    mockWebPush.send.mockRejectedValue(new MockPushGoneError(410));

    await expect(pushService.sendTest(7, ENDPOINT)).rejects.toMatchObject({
      statusCode: 410,
      code: 'PUSH_SUBSCRIPTION_GONE',
    });
    expect(mockSubscriptionRepo.deleteByEndpoint).toHaveBeenCalledWith(7, ENDPOINT);
  });

  it('403 → 502 PUSH_REJECTED con details.status, sin borrar la fila', async () => {
    mockWebPush.send.mockRejectedValue(new MockPushRejectedError(403));

    await expect(pushService.sendTest(7, ENDPOINT)).rejects.toMatchObject({
      statusCode: 502,
      code: 'PUSH_REJECTED',
      details: { status: 403 },
    });
    expect(mockSubscriptionRepo.deleteByEndpoint).not.toHaveBeenCalled();
  });

  it('timeout → 502 PUSH_SEND_FAILED, sin borrar la fila', async () => {
    mockWebPush.send.mockRejectedValue(new Error('Socket timeout'));

    await expect(pushService.sendTest(7, ENDPOINT)).rejects.toMatchObject({
      statusCode: 502,
      code: 'PUSH_SEND_FAILED',
    });
    expect(mockSubscriptionRepo.deleteByEndpoint).not.toHaveBeenCalled();
    expect(mockLogger.warn.mock.calls[0][0]).not.toContain(ENDPOINT);
  });
});

describe('notifyNew', () => {
  const OTHER_ENDPOINT = 'https://web.push.apple.com/QGx3abc';
  const recent = () => new Date(Date.now() - 60_000);
  const newCard = (id, overrides = {}) => ({
    id,
    user_id: 7,
    type: 'price_alert_hit',
    price_alert_id: id,
    date_reminder_id: null,
    payload: { symbol: 'BTCUSDT', direction: 'below', target_price: 60000 },
    created_at: recent(),
    ...overrides,
  });

  beforeEach(() => {
    mockJobStateRepo.get.mockResolvedValue({ push_notified_id: 10 });
    mockJobStateRepo.setPushNotifiedId.mockResolvedValue();
    mockNotificationRepo.findCreatedAfter.mockResolvedValue([newCard(11), newCard(12)]);
    mockSubscriptionRepo.findByUserIds.mockResolvedValue([ROW, { ...ROW, id: 2, endpoint: OTHER_ENDPOINT }]);
    mockWebPush.send.mockResolvedValue();
  });

  it('marca NULL → la siembra en MAX(id) sin enviar nada', async () => {
    mockJobStateRepo.get.mockResolvedValue({ push_notified_id: null });
    mockNotificationRepo.maxId.mockResolvedValue(42);

    await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(42);
    expect(mockNotificationRepo.findCreatedAfter).not.toHaveBeenCalled();
    expect(mockWebPush.send).not.toHaveBeenCalled();
  });

  it('envía cada mensaje a cada dispositivo del usuario y avanza la marca al id más alto leído', async () => {
    const result = await pushService.notifyNew();

    expect(mockNotificationRepo.findCreatedAfter).toHaveBeenCalledWith(10);
    expect(mockSubscriptionRepo.findByUserIds).toHaveBeenCalledWith([7]);
    expect(mockWebPush.send).toHaveBeenCalledTimes(4); // 2 mensajes × 2 dispositivos
    expect(mockWebPush.send.mock.calls[0][2]).toEqual({ ttl: 24 * 3600, topic: 'pa-11' });
    expect(result).toEqual({ sent: 4, failed: 0, removed: 0 });
    expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(12);
  });

  it('la marca se guarda después de enviar', async () => {
    await pushService.notifyNew();

    const sentAt = Math.max(...mockWebPush.send.mock.invocationCallOrder);
    expect(mockJobStateRepo.setPushNotifiedId.mock.invocationCallOrder[0]).toBeGreaterThan(sentAt);
  });

  it('sin tarjetas nuevas no envía ni mueve la marca', async () => {
    mockNotificationRepo.findCreatedAfter.mockResolvedValue([]);

    await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(mockJobStateRepo.setPushNotifiedId).not.toHaveBeenCalled();
  });

  it('solo invalidaciones → no envía, pero la marca las deja atrás', async () => {
    mockNotificationRepo.findCreatedAfter.mockResolvedValue([newCard(11, { type: 'price_alert_invalidation' })]);

    await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(mockWebPush.send).not.toHaveBeenCalled();
    expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(11);
  });

  describe('la marca avanza en todos los caminos', () => {
    it('push desactivado', async () => {
      mockWebPush.isEnabled.mockReturnValue(false);

      await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 0, removed: 0 });
      expect(mockWebPush.send).not.toHaveBeenCalled();
      expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(12);
    });

    it('sin dispositivos vinculados', async () => {
      mockSubscriptionRepo.findByUserIds.mockResolvedValue([]);

      await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 0, removed: 0 });
      expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(12);
    });

    it('todos los envíos con 403', async () => {
      mockWebPush.send.mockRejectedValue(new MockPushRejectedError(403));

      await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 4, removed: 0 });
      expect(mockSubscriptionRepo.deleteByEndpoints).not.toHaveBeenCalled();
      expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(12);
    });

    it('un payload raro que hace lanzar al armar los mensajes', async () => {
      // Una fecha inválida hace lanzar a toISOString() dentro de buildPushMessages
      mockNotificationRepo.findCreatedAfter.mockResolvedValue([newCard(11, { created_at: 'no es una fecha' })]);

      await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 1, removed: 0 });
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockJobStateRepo.setPushNotifiedId).toHaveBeenCalledWith(11);
    });
  });

  it('404/410 borran la suscripción; 403 y 5xx no', async () => {
    mockWebPush.send.mockImplementation(async (subscription, message) => {
      if (subscription.endpoint === OTHER_ENDPOINT) throw new MockPushGoneError(410);
      if (message.id === 12) throw new Error('503');
    });
    mockSubscriptionRepo.deleteByEndpoints.mockResolvedValue(1);

    await expect(pushService.notifyNew()).resolves.toEqual({ sent: 1, failed: 1, removed: 1 });
    expect(mockSubscriptionRepo.deleteByEndpoints).toHaveBeenCalledWith([OTHER_ENDPOINT]);
    expect(mockLogger.warn.mock.calls[0][0]).toContain('fcm.googleapis.com');
    expect(mockLogger.warn.mock.calls[0][0]).not.toContain(ENDPOINT);
  });

  it('nunca lanza: ni si falla la lectura de la marca, ni si falla guardarla', async () => {
    mockJobStateRepo.get.mockRejectedValueOnce(new Error('BD caída'));
    await expect(pushService.notifyNew()).resolves.toEqual({ sent: 0, failed: 0, removed: 0 });

    mockJobStateRepo.setPushNotifiedId.mockRejectedValueOnce(new Error('BD caída'));
    await expect(pushService.notifyNew()).resolves.toEqual({ sent: 4, failed: 0, removed: 0 });
    expect(mockLogger.error.mock.calls.at(-1)[0]).toContain('no se pudo guardar la marca 12');
  });
});
