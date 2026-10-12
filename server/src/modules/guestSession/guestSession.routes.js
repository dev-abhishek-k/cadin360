import { Router } from 'express';
import { guestSessionController } from './guestSession.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.post('/', asyncHandler(guestSessionController.create));
router.get('/current', asyncHandler(guestSessionController.getCurrent));
router.post('/associate', authenticate, asyncHandler(guestSessionController.associate));

export default router;

