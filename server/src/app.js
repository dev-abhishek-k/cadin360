import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import guestSessionRoutes from './modules/guestSession/guestSession.routes.js';
import eventRoutes from './modules/events/event.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import mockPaymentRoutes from './modules/payments/mockPayment.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import { corsOptions } from './config/cors.js';
import { notFound } from './shared/middleware/notFound.middleware.js';
import { errorHandler } from './shared/middleware/error.middleware.js';

export function createApp({ clientUrl = 'http://localhost:5173', nodeEnv = 'development' } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors(corsOptions(clientUrl)));
  app.use(cookieParser());
  app.use(morgan(nodeEnv === 'test' ? 'tiny' : 'dev'));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/guest-sessions', guestSessionRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/mock-payments', mockPaymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
