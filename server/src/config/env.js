import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

import { AUTH_CONFIG } from '../shared/constants/auth.constants.js';

loadDotenv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

export function validateEnv(source = process.env) {
  const required = ['MONGODB_URI', 'CLIENT_URL'];
  const missing = required.filter((key) => !source[key]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const port = Number(source.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  try {
    const uri = new URL(source.MONGODB_URI);
    if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol)) throw new Error();
    new URL(source.CLIENT_URL);
  } catch { throw new Error('MONGODB_URI or CLIENT_URL is invalid'); }
  return {
    nodeEnv: source.NODE_ENV ?? 'development',
    port,
    mongodbUri: source.MONGODB_URI,
    clientUrl: source.CLIENT_URL,
    jwtSecret: source.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET,
  };
}
