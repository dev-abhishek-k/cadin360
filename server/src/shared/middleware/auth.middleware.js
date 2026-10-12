import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AUTH_CONFIG, AUTH_MESSAGES } from '../constants/auth.constants.js';

export function authenticate(req, _res, next) {
  let token = req.cookies?.[AUTH_CONFIG.COOKIE_NAME];

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  if (!token) {
    return next(new ApiError(HTTP_STATUS.UNAUTHORIZED, AUTH_MESSAGES.TOKEN_REQUIRED));
  }

  try {
    const secret = process.env.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (_err) {
    next(new ApiError(HTTP_STATUS.UNAUTHORIZED, AUTH_MESSAGES.TOKEN_INVALID));
  }
}

export function optionalAuthenticate(req, _res, next) {
  let token = req.cookies?.[AUTH_CONFIG.COOKIE_NAME];

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const secret = process.env.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
  } catch (_err) {
    req.user = null;
  }
  next();
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(HTTP_STATUS.FORBIDDEN, AUTH_MESSAGES.ACCESS_DENIED));
    }
    next();
  };
}
