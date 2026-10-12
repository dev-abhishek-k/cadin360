import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { optionalAuthenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

// Trusted internal server mock payment verification endpoint
router.post('/verify-mock', optionalAuthenticate, asyncHandler(paymentController.verifyMockPayment));

export default router;
