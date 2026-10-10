import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './modules/health/health.routes.js';
import { corsOptions } from './config/cors.js';
import { notFound } from './shared/middleware/notFound.middleware.js';
import { errorHandler } from './shared/middleware/error.middleware.js';

export function createApp({ clientUrl = 'http://localhost:5173', nodeEnv = 'development' } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors(corsOptions(clientUrl)));
  app.use(morgan(nodeEnv === 'test' ? 'tiny' : 'dev'));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', healthRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
