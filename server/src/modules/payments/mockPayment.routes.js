import { Router } from 'express';
import { mockPaymentController } from './mockPayment.controller.js';
import { optionalAuthenticate } from '../../shared/middleware/auth.middleware.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = Router();

// 1. Get available mock plans catalog
router.get('/plans', mockPaymentController.getPlans);

// 2. Create a pending mock payment attempt
router.post('/', optionalAuthenticate, asyncHandler(mockPaymentController.createAttempt));

// 3. Simulate and verify mock payment attempt
router.post(
  '/:paymentAttemptId/simulate',
  optionalAuthenticate,
  asyncHandler(mockPaymentController.simulatePayment)
);

// 4. Retrieve status of a payment attempt
router.get(
  '/:paymentAttemptId',
  optionalAuthenticate,
  asyncHandler(mockPaymentController.getAttemptStatus)
);

export default router;
