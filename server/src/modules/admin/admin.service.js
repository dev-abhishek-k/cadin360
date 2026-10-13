import mongoose from 'mongoose';
import { adminJourneyRepository } from './admin.repository.js';
import { journeyService } from '../events/journey.service.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

/**
 * Parses and normalizes date range parameters with UTC boundaries.
 * Returns { startUtc, endUtc }. Throws ApiError on invalid dates.
 */
export function parseUtcDateRange(startDateStr, endDateStr) {
  let startUtc = null;
  let endUtc = null;

  if (startDateStr) {
    const trimmed = String(startDateStr).trim();
    const d = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00.000Z`);
    if (isNaN(d.getTime())) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Invalid startDate format: ${startDateStr}`);
    }
    startUtc = d;
  }

  if (endDateStr) {
    const trimmed = String(endDateStr).trim();
    const d = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T23:59:59.999Z`);
    if (isNaN(d.getTime())) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Invalid endDate format: ${endDateStr}`);
    }
    endUtc = d;
  }

  if (startUtc && endUtc && startUtc.getTime() > endUtc.getTime()) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Start date cannot be after end date');
  }

  return { startUtc, endUtc };
}

/**
 * Service to aggregate, filter, and paginate logical journeys for the Admin Dashboard.
 */
export const adminJourneyService = {
  /**
   * Retrieves paginated journeys, summary metrics, and metadata according to applied filters.
   */
  async getJourneys(
    {
      search = '',
      startDate = null,
      endDate = null,
      source = null,
      page = 1,
      limit = 20,
    } = {},
    repo = adminJourneyRepository
  ) {
    // 1. Validate pagination bounds
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // 2. Validate UTC date range
    const { startUtc, endUtc } = parseUtcDateRange(startDate, endDate);

    // The live repository performs filtering, totals, and pagination in MongoDB.
    // Injected fixture repositories retain the in-memory path used by unit tests.
    if (typeof repo.getPaginatedJourneys === 'function' && mongoose.connection.readyState === 1) {
      return repo.getPaginatedJourneys({
        search: String(search || '').trim(),
        source: String(source || '').trim(),
        startUtc,
        endUtc,
        page: parsedPage,
        limit: parsedLimit,
      });
    }

    // 3. Fast lookup data from repository
    const { users, unassociatedGuestSessions, eventJourneys } = await repo.getAdminJourneysData();

    const userMap = new Map();
    for (const u of users) {
      userMap.set(u._id ? u._id.toString() : u.id ? u.id.toString() : String(u), u);
    }

    // 5. Track all journeys, including empty ones if no date filter is applied
    const journeyMap = new Map();

    for (const row of eventJourneys) {
      journeyMap.set(row._id, {
        journeyId: row._id,
        identityType: row.identityType,
        userId: row.userId ? row.userId.toString() : null,
        guestSessionId: row.guestSessionId ? row.guestSessionId.toString() : null,
        events: row.events || [],
      });
    }

    // If no date filter is applied, include empty registered users and empty unassociated sessions
    if (!startUtc && !endUtc) {
      for (const u of users) {
        const uId = u._id.toString();
        const jId = `user_${uId}`;
        if (!journeyMap.has(jId)) {
          journeyMap.set(jId, {
            journeyId: jId,
            identityType: 'user',
            userId: uId,
            guestSessionId: null,
            events: [],
          });
        }
      }

      for (const g of unassociatedGuestSessions) {
        const gId = g._id.toString();
        const jId = `guest_${gId}`;
        if (!journeyMap.has(jId)) {
          journeyMap.set(jId, {
            journeyId: jId,
            identityType: 'guest',
            userId: null,
            guestSessionId: gId,
            events: [],
          });
        }
      }
    }

    const allJourneys = Array.from(journeyMap.values());

    // 6. Filter by Date Range, Search term, and First Source
    const cleanSearch = String(search || '').toLowerCase().trim();
    const cleanSource = String(source || '').toLowerCase().trim();

    const filteredJourneys = [];

    for (const j of allJourneys) {
      // Rule 1: Date Filter qualification
      // A journey qualifies if at least one event occurred inside the selected date range.
      if (startUtc || endUtc) {
        const hasEventInRange = j.events.some((e) => {
          const t = new Date(e.occurredAt).getTime();
          if (startUtc && t < startUtc.getTime()) return false;
          if (endUtc && t > endUtc.getTime()) return false;
          return true;
        });
        if (!hasEventInRange) {
          continue;
        }
      }

      // Rule 2: Derive display identity
      let displayIdentity = 'Anonymous Visitor';
      if (j.identityType === 'user' && j.userId) {
        const userDoc = userMap.get(j.userId);
        displayIdentity = userDoc ? userDoc.name || userDoc.email : `User ${j.userId.slice(-6)}`;
      } else if (j.guestSessionId) {
        displayIdentity = `Guest ${j.guestSessionId.slice(-6)}`;
      }

      // Rule 3: Search filter (User name, guest ID, or journey ID)
      if (cleanSearch) {
        const matches =
          displayIdentity.toLowerCase().includes(cleanSearch) ||
          j.journeyId.toLowerCase().includes(cleanSearch) ||
          (j.guestSessionId && j.guestSessionId.toLowerCase().includes(cleanSearch)) ||
          (j.userId && j.userId.toLowerCase().includes(cleanSearch));

        if (!matches) {
          continue;
        }
      }

      // Rule 4: Compute full journey metrics using Module 4's journeyService
      // Qualified journeys calculate firstActivity, lastActivity, attribution, uniqueEventCount, and stages using complete history!
      const summary = journeyService.formatJourneySummary({
        journeyId: j.journeyId,
        identityType: j.identityType,
        events: j.events,
      });

      // Rule 5: Source filter (based on Module 4 attribution)
      if (cleanSource && cleanSource !== 'all') {
        if (cleanSource === 'none' || cleanSource === 'null' || cleanSource === 'unattributed') {
          if (summary.firstSource !== null) {
            continue;
          }
        } else {
          if (!summary.firstSource || summary.firstSource.toLowerCase() !== cleanSource) {
            continue;
          }
        }
      }

      filteredJourneys.push({
        journeyId: j.journeyId,
        identityType: j.identityType,
        displayIdentity,
        firstActivityAt: summary.firstActivityAt,
        lastActivityAt: summary.lastActivityAt,
        firstSource: summary.firstSource,
        uniqueEventCount: summary.uniqueEventCount,
        stages: summary.stages,
      });
    }

    // 7. Calculate summary metrics across the entire filtered set (not just current page)
    const summaryMetrics = {
      totalJourneys: filteredJourneys.length,
      arrived: filteredJourneys.filter((j) => j.stages.arrived).length,
      explored: filteredJourneys.filter((j) => j.stages.explored).length,
      signedUp: filteredJourneys.filter((j) => j.stages.signedUp).length,
      paid: filteredJourneys.filter((j) => j.stages.paid).length,
    };

    // Sort journeys consistently: registered users first, then by lastActivityAt descending
    filteredJourneys.sort((a, b) => {
      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bTime - aTime;
    });

    // 8. Server-side pagination
    const total = filteredJourneys.length;
    const totalPages = Math.ceil(total / parsedLimit) || 1;
    const startIndex = (parsedPage - 1) * parsedLimit;
    const paginatedJourneys = filteredJourneys.slice(startIndex, startIndex + parsedLimit);

    return {
      journeys: paginatedJourneys,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
      summaryMetrics,
    };
  },

  /**
   * Retrieves full journey details, stage milestone progress, and chronological event timeline.
   */
  async getJourneyDetails(
    journeyId,
    { page = 1, limit = 50 } = {},
    repo = adminJourneyRepository
  ) {
    if (!journeyId || typeof journeyId !== 'string' || !journeyId.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid journey ID');
    }

    const cleanJourneyId = journeyId.trim();
    let identityType = null;
    let targetUserId = null;
    let targetGuestId = null;

    if (cleanJourneyId.startsWith('user_')) {
      identityType = 'user';
      targetUserId = cleanJourneyId.slice(5).trim();
      if (!targetUserId) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid journey ID: missing user identifier');
      }
    } else if (cleanJourneyId.startsWith('guest_')) {
      identityType = 'guest';
      targetGuestId = cleanJourneyId.slice(6).trim();
      if (!targetGuestId) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid journey ID: missing guest identifier');
      }
    } else {
      // Direct raw ID passed: try user then guest
      const user = await repo.findUserById(cleanJourneyId);
      if (user) {
        identityType = 'user';
        targetUserId = cleanJourneyId;
      } else {
        const guest = await repo.findGuestSessionById(cleanJourneyId);
        if (guest) {
          identityType = 'guest';
          targetGuestId = cleanJourneyId;
        } else {
          throw new ApiError(HTTP_STATUS.NOT_FOUND, `Journey with ID "${journeyId}" not found`);
        }
      }
    }

    let userDoc = null;
    let guestSessionDoc = null;
    let associatedGuestSessions = [];
    let guestSessionIds = [];
    let displayIdentity = 'Anonymous Visitor';
    let userEmail = null;

    if (identityType === 'user') {
      userDoc = await repo.findUserById(targetUserId);
      if (!userDoc) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, `Journey with ID "${journeyId}" not found`);
      }
      displayIdentity = userDoc.name || userDoc.email;
      userEmail = userDoc.email;

      const sessions = await repo.findGuestSessionsByUserId(targetUserId);
      associatedGuestSessions = (sessions || []).map((s) => ({
        guestSessionId: s._id ? s._id.toString() : s.id ? s.id.toString() : String(s),
        createdAt: s.createdAt,
      }));
      guestSessionIds = associatedGuestSessions.map((s) => s.guestSessionId);
    } else if (identityType === 'guest') {
      guestSessionDoc = await repo.findGuestSessionById(targetGuestId);
      if (!guestSessionDoc) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, `Journey with ID "${journeyId}" not found`);
      }

      // Claimed guest session redirection: if associated with a user, unify under that user!
      if (guestSessionDoc.associatedUserId) {
        const ownerId = guestSessionDoc.associatedUserId._id
          ? guestSessionDoc.associatedUserId._id.toString()
          : guestSessionDoc.associatedUserId.toString();
        userDoc = await repo.findUserById(ownerId);
        if (userDoc) {
          identityType = 'user';
          targetUserId = ownerId;
          displayIdentity = userDoc.name || userDoc.email;
          userEmail = userDoc.email;
          const sessions = await repo.findGuestSessionsByUserId(ownerId);
          associatedGuestSessions = (sessions || []).map((s) => ({
            guestSessionId: s._id ? s._id.toString() : s.id ? s.id.toString() : String(s),
            createdAt: s.createdAt,
          }));
          guestSessionIds = associatedGuestSessions.map((s) => s.guestSessionId);
        } else {
          displayIdentity = `Guest ${targetGuestId.slice(-6)}`;
          guestSessionIds = [targetGuestId];
        }
      } else {
        displayIdentity = `Guest ${targetGuestId.slice(-6)}`;
        guestSessionIds = [targetGuestId];
      }
    }

    const resolvedJourneyId =
      identityType === 'user' ? `user_${targetUserId}` : `guest_${targetGuestId}`;

    // Fetch all events for this logical journey
    const rawEvents = await repo.findEventsForJourney({
      userId: targetUserId,
      guestSessionIds,
    });

    // Deduplicate any repeated events by unique eventId
    const seenEventIds = new Set();
    const allEvents = [];
    for (const ev of rawEvents) {
      const key = ev.eventId || (ev._id ? ev._id.toString() : null);
      if (key) {
        if (!seenEventIds.has(key)) {
          seenEventIds.add(key);
          allEvents.push(ev);
        }
      } else {
        allEvents.push(ev);
      }
    }

    // Ensure deterministic ordering: occurredAt ASC, eventId ASC
    allEvents.sort((a, b) => {
      const aTime = new Date(a.occurredAt).getTime();
      const bTime = new Date(b.occurredAt).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return String(a.eventId).localeCompare(String(b.eventId));
    });

    // Compute complete journey metrics using Module 4 functions
    const bounds = journeyService.calculateActivityBounds(allEvents);
    const firstSource = journeyService.calculateFirstSource(allEvents);
    const stages = journeyService.calculateJourneyStages(allEvents);
    const stageDetails = journeyService.calculateJourneyStageDetails(allEvents);

    // Timeline pagination
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const total = allEvents.length;
    const totalPages = Math.ceil(total / parsedLimit) || 1;
    const startIndex = (parsedPage - 1) * parsedLimit;
    const paginatedEvents = allEvents.slice(startIndex, startIndex + parsedLimit);

    // Format paginated events for timeline
    const formattedTimeline = paginatedEvents.map((event) => {
      const rawRoute = event.canonicalRoute || event.originalRoute;
      const label = journeyService.mapCanonicalRoute(rawRoute) || event.canonicalLabel || null;
      const occurredAt =
        event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
      const receivedAt =
        event.receivedAt instanceof Date
          ? event.receivedAt
          : event.receivedAt
          ? new Date(event.receivedAt)
          : null;

      return {
        eventId: event.eventId,
        type: event.type,
        occurredAt: !isNaN(occurredAt.getTime()) ? occurredAt.toISOString() : event.occurredAt,
        receivedAt:
          receivedAt && !isNaN(receivedAt.getTime()) ? receivedAt.toISOString() : event.receivedAt,
        canonicalRoute: event.canonicalRoute,
        originalRoute: event.originalRoute || event.canonicalRoute,
        canonicalLabel: label,
        exerciseName: event.exerciseName || null,
        source: event.source || null,
        paymentVerification: event.paymentVerification || null,
        metadata: event.metadata || {},
      };
    });

    return {
      journeyId: resolvedJourneyId,
      identityType,
      displayIdentity,
      email: userEmail,
      firstActivityAt: bounds.firstActivityAt,
      lastActivityAt: bounds.lastActivityAt,
      firstSource,
      uniqueEventCount: bounds.uniqueEventCount,
      stages,
      stageDetails,
      associatedGuestSessionCount: associatedGuestSessions.length,
      associatedGuestSessions,
      timeline: formattedTimeline,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
    };
  },
};
