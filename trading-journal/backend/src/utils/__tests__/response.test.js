import {
  sendSuccess,
  sendError,
  sendCreated,
  sendDeleted,
  sendNotFound,
  sendValidationError,
} from '../response.js';

/**
 * Crea un doble de `res` de Express que captura status/json.
 */
const mockRes = () => {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

describe('utils/response', () => {
  it('sendSuccess devuelve { success:true, data } con 200 por defecto', () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 1 } });
  });

  it('sendSuccess incluye message solo si se pasa', () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, 'ok');
    expect(res.body.message).toBe('ok');
  });

  it('sendCreated responde con 201', () => {
    const res = mockRes();
    sendCreated(res, { id: 2 });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Recurso creado exitosamente');
  });

  it('sendDeleted responde 200 con data null', () => {
    const res = mockRes();
    sendDeleted(res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('sendError arma { success:false, error:{ message, code } }', () => {
    const res = mockRes();
    sendError(res, 'boom', 500, 'INTERNAL_ERROR');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { message: 'boom', code: 'INTERNAL_ERROR' },
    });
  });

  it('sendError adjunta details cuando se pasan', () => {
    const res = mockRes();
    sendError(res, 'boom', 400, 'X', [{ field: 'a' }]);
    expect(res.body.error.details).toEqual([{ field: 'a' }]);
  });

  it('sendNotFound responde 404 con code NOT_FOUND', () => {
    const res = mockRes();
    sendNotFound(res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sendValidationError responde 400 con code VALIDATION_ERROR y details', () => {
    const res = mockRes();
    const details = [{ field: 'symbol', message: 'requerido' }];
    sendValidationError(res, details);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(details);
  });
});
