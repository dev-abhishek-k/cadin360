import { Router } from 'express';
import { eventController } from './event.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { optionalAuthenticate } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.post('/', optionalAuthenticate, asyncHandler(eventController.ingest));
router.get('/journey', optionalAuthenticate, asyncHandler(eventController.getJourney));
router.get('/journey/summary', optionalAuthenticate, asyncHandler(eventController.getJourneySummary));

export default router;
