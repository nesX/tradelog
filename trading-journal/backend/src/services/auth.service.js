import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import * as userRepository from '../repositories/user.repository.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const googleClient = new OAuth2Client(config.google.clientId);

/**
 * Verifica el token de Google y retorna el email
 */
export const verifyGoogleToken = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();

    return {
      email: payload.email,
      emailVerified: payload.email_verified,
    };
  } catch (error) {
    logger.error('Error verificando token de Google', { error: error.message });
    throw new AppError('Token de Google inválido', 401, 'INVALID_GOOGLE_TOKEN');
  }
};

/**
 * Autentica usuario con Google y genera JWT
 */
export const authenticateWithGoogle = async (idToken) => {
  // Verificar token de Google
  const googleUser = await verifyGoogleToken(idToken);

  if (!googleUser.emailVerified) {
    throw new AppError('Email no verificado en Google', 401, 'EMAIL_NOT_VERIFIED');
  }

  // Buscar usuario en la base de datos
  const user = await userRepository.findByEmail(googleUser.email);

  if (!user) {
    logger.warn('Intento de login con email no autorizado', { email: googleUser.email });
    throw new AppError('Usuario no autorizado', 403, 'USER_NOT_AUTHORIZED');
  }

  // Actualizar último login
  await userRepository.updateLastLogin(user.id);

  logger.info('Usuario autenticado', { userId: user.id, email: user.email });

  // Generar JWT
  const token = generateToken(user);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token,
  };
};

/**
 * Genera un JWT para el usuario
 */
export const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
    }
  );
};

/**
 * Verifica un JWT y retorna el payload
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token expirado', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Token inválido', 401, 'INVALID_TOKEN');
  }
};

/**
 * Obtiene usuario actual por ID
 */
export const getCurrentUser = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }

  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
};
