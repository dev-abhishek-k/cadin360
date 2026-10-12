export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const AUTH_CONFIG = Object.freeze({
  PASSWORD_MIN_LENGTH: 6,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 60,
});

export const AUTH_MESSAGES = Object.freeze({
  PASSWORDS_DO_NOT_MATCH: 'Passwords do not match',
  PASSWORD_TOO_SHORT: `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters long`,
  REGISTRATION_FAILED: 'Registration failed',
  LOGIN_FAILED: 'Invalid credentials',
});
