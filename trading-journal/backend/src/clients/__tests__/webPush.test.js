import { jest } from '@jest/globals';

/**
 * Cliente de Web Push: configuración tolerante (nunca lanza) y traducción de
 * errores. `sendNotification` se espía: ningún mensaje sale a la red.
 */

const mockConfig = { env: 'test', push: {} };
const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule('../../config/env.js', () => ({ config: mockConfig }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ logger: mockLogger }));

const { default: webpush } = await import('web-push');
const KEYS = webpush.generateVAPIDKeys();
const SUBJECT = 'mailto:admin@example.com';
const SUBSCRIPTION = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p256', auth: 'auth' };

/** Importa una copia nueva del cliente (su configuración se fija en la primera llamada). */
const loadClient = async (push, env = 'test') => {
  mockConfig.env = env;
  mockConfig.push = push;
  jest.resetModules();
  const lib = (await import('web-push')).default;
  const client = await import('../webPush.js');
  return { client, lib };
};

const validPush = () => ({ publicKey: KEYS.publicKey, privateKey: KEYS.privateKey, subject: SUBJECT });

const webPushError = (lib, statusCode, body = '') =>
  new lib.WebPushError('Received unexpected response code', statusCode, {}, body, SUBSCRIPTION.endpoint);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('configuración', () => {
  it('con claves y subject válidos queda activado y expone la clave pública', async () => {
    const { client } = await loadClient(validPush());

    expect(client.isEnabled()).toBe(true);
    expect(client.getPublicKey()).toBe(KEYS.publicKey);
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it.each([
    ['sin claves', { publicKey: null, privateKey: null, subject: SUBJECT }, 'falta VAPID_PUBLIC_KEY'],
    ['solo la pública', { publicKey: KEYS.publicKey, privateKey: null, subject: SUBJECT }, 'falta VAPID_PRIVATE_KEY'],
    ['solo la privada', { publicKey: null, privateKey: KEYS.privateKey, subject: SUBJECT }, 'falta VAPID_PUBLIC_KEY'],
    [
      'pública mal pegada',
      { publicKey: KEYS.publicKey.slice(1), privateKey: KEYS.privateKey, subject: SUBJECT },
      'VAPID_PUBLIC_KEY con formato inválido',
    ],
    [
      'privada con caracteres fuera de base64url',
      { publicKey: KEYS.publicKey, privateKey: `${KEYS.privateKey.slice(0, -1)}=`, subject: SUBJECT },
      'VAPID_PRIVATE_KEY con formato inválido',
    ],
    ['sin subject', { ...validPush(), subject: null }, 'falta VAPID_SUBJECT'],
    ['subject que no es URL', { ...validPush(), subject: 'admin@example.com' }, 'VAPID_SUBJECT inválido'],
    ['subject http', { ...validPush(), subject: 'http://example.com' }, 'VAPID_SUBJECT inválido'],
  ])('%s → desactivado sin lanzar, con el motivo en el log', async (_name, push, reason) => {
    const { client } = await loadClient(push);

    expect(client.isEnabled()).toBe(false);
    expect(client.getPublicKey()).toBeNull();
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0][0]).toContain(`Web Push desactivado: ${reason}`);
  });

  it('si setVapidDetails lanza, queda desactivado sin lanzar', async () => {
    const { client, lib } = await loadClient(validPush());
    jest.spyOn(lib, 'setVapidDetails').mockImplementation(() => {
      throw new Error('Vapid public key should be 65 bytes long when decoded.');
    });

    expect(client.isEnabled()).toBe(false);
    expect(mockLogger.info.mock.calls[0][0]).toContain('claves VAPID inválidas');
  });

  it('loguea el motivo una sola vez', async () => {
    const { client } = await loadClient({ publicKey: null, privateKey: null, subject: null });

    client.isEnabled();
    client.getPublicKey();
    client.isEnabled();

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
  });

  it('en producción el motivo se loguea como error', async () => {
    const { client } = await loadClient({ publicKey: null, privateKey: null, subject: SUBJECT }, 'production');

    expect(client.isEnabled()).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});

describe('send', () => {
  it('envía el mensaje como JSON con TTL, urgencia alta, timeout y topic', async () => {
    const { client, lib } = await loadClient(validPush());
    const spy = jest.spyOn(lib, 'sendNotification').mockResolvedValue({ statusCode: 201 });

    await client.send(SUBSCRIPTION, { v: 1, kind: 'test' }, { ttl: 3600, topic: 'pa-77' });

    expect(spy).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: 'p256', auth: 'auth' } },
      JSON.stringify({ v: 1, kind: 'test' }),
      { TTL: 3600, urgency: 'high', timeout: 10_000, topic: 'pa-77' }
    );
  });

  it('sin topic no manda la cabecera Topic', async () => {
    const { client, lib } = await loadClient(validPush());
    const spy = jest.spyOn(lib, 'sendNotification').mockResolvedValue({ statusCode: 201 });

    await client.send(SUBSCRIPTION, { v: 1, kind: 'summary' }, { ttl: 60, topic: null });

    expect(spy.mock.calls[0][2]).not.toHaveProperty('topic');
  });

  it.each([404, 410])('%i → PushGoneError', async (status) => {
    const { client, lib } = await loadClient(validPush());
    jest.spyOn(lib, 'sendNotification').mockRejectedValue(webPushError(lib, status));

    const err = await client.send(SUBSCRIPTION, {}, { ttl: 60 }).catch((e) => e);

    expect(err).toBeInstanceOf(client.PushGoneError);
    expect(err.status).toBe(status);
  });

  it.each([400, 401, 403, 413])('%i → PushRejectedError con el status', async (status) => {
    const { client, lib } = await loadClient(validPush());
    jest.spyOn(lib, 'sendNotification').mockRejectedValue(webPushError(lib, status, '{"reason":"BadJwtToken"}'));

    const err = await client.send(SUBSCRIPTION, {}, { ttl: 60 }).catch((e) => e);

    expect(err).toBeInstanceOf(client.PushRejectedError);
    expect(err.status).toBe(status);
    expect(err.message).toContain('BadJwtToken');
  });

  it('5xx y errores de red se propagan tal cual', async () => {
    const { client, lib } = await loadClient(validPush());
    const serverError = webPushError(lib, 503);
    const timeout = new Error('Socket timeout');
    jest.spyOn(lib, 'sendNotification').mockRejectedValueOnce(serverError).mockRejectedValueOnce(timeout);

    await expect(client.send(SUBSCRIPTION, {}, { ttl: 60 })).rejects.toBe(serverError);
    await expect(client.send(SUBSCRIPTION, {}, { ttl: 60 })).rejects.toBe(timeout);
  });

  it('con el push desactivado no intenta enviar', async () => {
    const { client, lib } = await loadClient({ publicKey: null, privateKey: null, subject: null });
    const spy = jest.spyOn(lib, 'sendNotification');

    await expect(client.send(SUBSCRIPTION, {}, { ttl: 60 })).rejects.toThrow('Web Push desactivado');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('endpointHost', () => {
  it('devuelve solo el host del endpoint', async () => {
    const { client } = await loadClient(validPush());

    expect(client.endpointHost('https://web.push.apple.com/QGx3abc')).toBe('web.push.apple.com');
    expect(client.endpointHost('no es una url')).toBe('endpoint inválido');
  });
});
