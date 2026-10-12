export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const AUTH_CONFIG = Object.freeze({
  COOKIE_NAME: 'token',
  JWT_EXPIRES_IN: '1d',
  COOKIE_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  SALT_ROUNDS: 10,
  PASSWORD_MIN_LENGTH: 6,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 60,
  DEFAULT_JWT_SECRET: 'cadin360-jwt-secret-key-2026',
});

export const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export const AUTH_MESSAGES = Object.freeze({
  // Success messages
  REGISTRATION_SUCCESS: 'Registration successful',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logged out successfully',
  PROFILE_FETCH_SUCCESS: 'User profile retrieved successfully',

  // Validation messages
  NAME_REQUIRED: 'Name is required',
  EMAIL_REQUIRED: 'Email is required',
  PASSWORD_REQUIRED: 'Password is required',
  INVALID_EMAIL: 'Please provide a valid email address',
  PASSWORD_TOO_SHORT: `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters long`,
  PASSWORDS_DO_NOT_MATCH: 'Passwords do not match',

  // Error & authorization messages
  USER_ALREADY_EXISTS: 'User with this email already exists',
  INVALID_CREDENTIALS: 'Invalid email or password',
  USER_NOT_FOUND: 'User not found',
  SESSION_ID_MISSING: 'User ID missing from session',
  TOKEN_REQUIRED: 'Authentication token required',
  TOKEN_INVALID: 'Invalid or expired authentication token',
  ACCESS_DENIED: 'Access denied: insufficient permissions',
  UNAUTHORIZED: 'Unauthorized',
});
