import { eventService } from './event.service.js';
import { journeyService } from './journey.service.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const eventController = {
  async ingest(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.body?.guestCredential;

    // 1. Resolve identity from server credentials (never browser-supplied overrides)
    const identity = await eventService.resolveIdentity({
      user: req.user,
      rawGuestCredential,
    });

    // 2. Ingest event with browser-level validation rules
    const result = await eventService.ingestEvent(req.body, identity, { isBrowser: true });

    const status = result.duplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED;

    res.status(status).json({
      success: true,
      duplicate: result.duplicate,
      data: result.event,
    });
  },

  async getJourney(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.query?.guestCredential;

    const identity = await eventService.resolveIdentity({
      user: req.user,
      rawGuestCredential,
    });

    const events = await eventService.getJourneyEvents(identity);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: events,
    });
  },

  async getJourneySummary(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.query?.guestCredential;

    const identity = await eventService.resolveIdentity({
      user: req.user,
      rawGuestCredential,
    });

    const includeTimeline = req.query?.includeTimeline === 'true';

    const summary = await journeyService.getJourneySummary(identity, {
      includeTimeline,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: summary,
    });
  },
};

