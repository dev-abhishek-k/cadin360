import { Router } from 'express';
import { authController } from './auth.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';
import { rateLimiter } from '../../shared/middleware/rateLimit.middleware.js';

const router = Router();

router.post('/signup', asyncHandler(authController.signup));
router.post('/register', asyncHandler(authController.register));
router.post('/login', rateLimiter({ max: 15, windowMs: 60 * 1000 }), asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));

export default router;
