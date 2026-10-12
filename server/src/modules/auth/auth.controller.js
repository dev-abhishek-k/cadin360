import { authService } from './auth.service.js';
import { apiResponse } from '../../shared/utils/ApiResponse.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';
import { AUTH_CONFIG, AUTH_MESSAGES } from './auth.constants.js';

export function getAuthCookieOptions(nodeEnv = process.env.NODE_ENV) {
  const isProd = nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: AUTH_CONFIG.COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

export const authController = {
  async signup(req, res) {
    const rawGuestCredential =
      req.body?.guestCredential || req.headers['x-guest-session-credential'];
    const { user, token, guestSession } = await authService.signup({
      ...req.body,
      guestCredential: rawGuestCredential,
    });
    const payload = {
      user,
      token,
      ...(guestSession ? { guestSession } : {}),
    };
    res.cookie(AUTH_CONFIG.COOKIE_NAME, token, getAuthCookieOptions(process.env.NODE_ENV));
    res.status(HTTP_STATUS.CREATED).json(
      apiResponse(true, AUTH_MESSAGES.REGISTRATION_SUCCESS, {
        ...payload,
        data: payload,
      })
    );
  },

  async register(req, res) {
    return await authController.signup(req, res);
  },

  async login(req, res) {
    const rawGuestCredential =
      req.body?.guestCredential || req.headers['x-guest-session-credential'];
    const { user, token, guestSession } = await authService.login({
      ...req.body,
      guestCredential: rawGuestCredential,
    });
    const payload = {
      user,
      token,
      ...(guestSession ? { guestSession } : {}),
    };
    res.cookie(AUTH_CONFIG.COOKIE_NAME, token, getAuthCookieOptions(process.env.NODE_ENV));
    res.status(HTTP_STATUS.OK).json(
      apiResponse(true, AUTH_MESSAGES.LOGIN_SUCCESS, {
        ...payload,
        data: payload,
      })
    );
  },

  async logout(_req, res) {
    res.clearCookie(AUTH_CONFIG.COOKIE_NAME, {
      ...getAuthCookieOptions(process.env.NODE_ENV),
      maxAge: 0,
    });
    res.status(HTTP_STATUS.OK).json(
      apiResponse(true, AUTH_MESSAGES.LOGOUT_SUCCESS)
    );
  },

  async me(req, res) {
    const user = await authService.getCurrentUser(req.user.id);
    res.status(HTTP_STATUS.OK).json(
      apiResponse(true, AUTH_MESSAGES.PROFILE_FETCH_SUCCESS, { user })
    );
  },
};
