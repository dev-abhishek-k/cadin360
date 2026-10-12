import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware.js';
import { USER_ROLES } from '../auth/auth.constants.js';

const router = Router();

// Protect all admin endpoints with authentication and admin authorization
router.use(authenticate);
router.use(authorize(USER_ROLES.ADMIN));

router.get('/journeys', adminController.getJourneys);
router.get('/journeys/:journeyId', adminController.getJourneyDetails);

export default router;
