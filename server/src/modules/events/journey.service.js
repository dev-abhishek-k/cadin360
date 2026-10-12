import { guestSessionRepository } from '../guestSession/guestSession.repository.js';
import { eventRepository } from './event.repository.js';
import { EVENT_TYPES, CANONICAL_ROUTE_LABELS } from './event.constants.js';

/**
 * Maps a route string to its canonical display label.
 * Returns null if the route has no pre-defined canonical alias.
 */
export function mapCanonicalRoute(route) {
  if (!route || typeof route !== 'string') return null;
  const clean = route.trim().split('?')[0].split('#')[0];
  return CANONICAL_ROUTE_LABELS[clean] || null;
}

/**
 * Calculates journey stages independently.
 */
export function calculateJourneyStages(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      arrived: false,
      explored: false,
      signedUp: false,
      paid: false,
    };
  }

  const arrived = events.some((e) => e.type === EVENT_TYPES.SHORT_LINK_OPENED);
  const explored = events.some((e) => e.type === EVENT_TYPES.PAGE_VIEWED);
  const signedUp = events.some((e) => e.type === EVENT_TYPES.SIGNUP_COMPLETED);

  // Paid reached ONLY if verified payment_completed event exists
  const paid = events.some((e) => {
    if (e.type !== EVENT_TYPES.PAYMENT_COMPLETED) return false;
    if (e.paymentVerification && (e.paymentVerification.status === 'verified' || e.paymentVerification.paymentId)) {
      return true;
    }
    if (e.metadata && (e.metadata.verified === true || e.metadata.status === 'verified' || e.metadata.paymentId)) {
      return true;
    }
    return false;
  });

  return {
    arrived,
    explored,
    signedUp,
    paid,
  };
}

/**
 * Calculates journey stages along with the earliest qualifying event timestamp for each stage.
 */
export function calculateJourneyStageDetails(events = []) {
  const base = calculateJourneyStages(events);

  const findEarliestTime = (predicate) => {
    const match = events.find(predicate);
    if (!match) return null;
    const d = match.occurredAt instanceof Date ? match.occurredAt : new Date(match.occurredAt);
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  };

  return {
    arrived: {
      reached: base.arrived,
      reachedAt: findEarliestTime((e) => e.type === EVENT_TYPES.SHORT_LINK_OPENED),
    },
    explored: {
      reached: base.explored,
      reachedAt: findEarliestTime((e) => e.type === EVENT_TYPES.PAGE_VIEWED),
    },
    signedUp: {
      reached: base.signedUp,
      reachedAt: findEarliestTime((e) => e.type === EVENT_TYPES.SIGNUP_COMPLETED),
    },
    paid: {
      reached: base.paid,
      reachedAt: findEarliestTime((e) => {
        if (e.type !== EVENT_TYPES.PAYMENT_COMPLETED) return false;
        if (e.paymentVerification && (e.paymentVerification.status === 'verified' || e.paymentVerification.paymentId)) {
          return true;
        }
        if (e.metadata && (e.metadata.verified === true || e.metadata.status === 'verified' || e.metadata.paymentId)) {
          return true;
        }
        return false;
      }),
    },
  };
}

/**
 * Calculates first and last activity timestamps and unique event count.
 * Events are assumed to be sorted: occurredAt ASC, eventId ASC.
 */
export function calculateActivityBounds(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      firstActivityAt: null,
      lastActivityAt: null,
      uniqueEventCount: 0,
    };
  }

  const first = events[0];
  const last = events[events.length - 1];

  const firstDate = first.occurredAt instanceof Date ? first.occurredAt : new Date(first.occurredAt);
  const lastDate = last.occurredAt instanceof Date ? last.occurredAt : new Date(last.occurredAt);

  const uniqueIds = new Set(events.map((e) => e.eventId));

  return {
    firstActivityAt: !isNaN(firstDate.getTime()) ? firstDate.toISOString() : null,
    lastActivityAt: !isNaN(lastDate.getTime()) ? lastDate.toISOString() : null,
    uniqueEventCount: uniqueIds.size,
  };
}

/**
 * Calculates first-source attribution using earliest short_link_opened event.
 * Documented policy: If earliest qualifying event has no source, return null (never substitute a later event).
 */
export function calculateFirstSource(events = []) {
  if (!Array.isArray(events) || events.length === 0) return null;

  const qualifying = events.filter((e) => e.type === EVENT_TYPES.SHORT_LINK_OPENED);
  if (qualifying.length === 0) return null;

  const earliest = qualifying[0];
  if (earliest.source && typeof earliest.source === 'string' && earliest.source.trim()) {
    return earliest.source.trim();
  }

  return null;
}

/**
 * Normalizes a journey summary payload.
 */
export function formatJourneySummary({
  journeyId,
  identityType,
  events = [],
}) {
  const bounds = calculateActivityBounds(events);
  const firstSource = calculateFirstSource(events);
  const stages = calculateJourneyStages(events);

  return {
    journeyId,
    identityType,
    firstActivityAt: bounds.firstActivityAt,
    lastActivityAt: bounds.lastActivityAt,
    firstSource,
    uniqueEventCount: bounds.uniqueEventCount,
    stages,
  };
}

/**
 * Normalizes complete journey details with formatted chronological timeline.
 */
export function formatJourneyDetails({
  journeyId,
  identityType,
  events = [],
}) {
  const summary = formatJourneySummary({ journeyId, identityType, events });

  const timeline = events.map((event) => {
    const rawRoute = event.canonicalRoute || event.originalRoute;
    const label = mapCanonicalRoute(rawRoute) || event.canonicalLabel || null;
    const occurredAt =
      event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
    const receivedAt =
      event.receivedAt instanceof Date ? event.receivedAt : event.receivedAt ? new Date(event.receivedAt) : null;

    return {
      eventId: event.eventId,
      type: event.type,
      occurredAt: !isNaN(occurredAt.getTime()) ? occurredAt.toISOString() : event.occurredAt,
      receivedAt: receivedAt && !isNaN(receivedAt.getTime()) ? receivedAt.toISOString() : event.receivedAt,
      canonicalRoute: event.canonicalRoute,
      originalRoute: event.originalRoute || event.canonicalRoute,
      canonicalLabel: label,
      exerciseName: event.exerciseName || null,
      source: event.source || null,
      metadata: event.metadata || {},
    };
  });

  return {
    ...summary,
    timeline,
  };
}

/**
 * Module 4 Journey Processing & Attribution Service.
 */
export const journeyService = {
  mapCanonicalRoute,
  calculateJourneyStages,
  calculateJourneyStageDetails,
  calculateActivityBounds,
  calculateFirstSource,
  formatJourneySummary,
  formatJourneyDetails,

  /**
   * Resolves the journey identity identifiers.
   * For an unauthenticated guest: returns the guest session ID.
   * For an authenticated user: returns the user ID and all associated guest session IDs.
   * If an associated guest session is provided, redirects to the user's unified journey.
   */
  async resolveJourneyIdentifiers(
    { userId = null, guestSessionId = null } = {},
    guestRepo = guestSessionRepository
  ) {
    if (userId) {
      const userSessions = await guestRepo.findByUserId(userId);
      const guestSessionIds = (userSessions || []).map((s) =>
        s._id ? s._id.toString() : s.id ? s.id.toString() : String(s)
      );

      if (guestSessionId) {
        const guestIdStr = guestSessionId.toString();
        if (!guestSessionIds.includes(guestIdStr)) {
          guestSessionIds.push(guestIdStr);
        }
      }

      return {
        journeyType: 'user',
        userId: userId.toString(),
        guestSessionIds,
      };
    }

    if (guestSessionId) {
      // Check if this guest session has already been claimed by a user
      const session = await guestRepo.findById(guestSessionId);
      if (session && session.associatedUserId) {
        const ownerId = session.associatedUserId._id
          ? session.associatedUserId._id.toString()
          : session.associatedUserId.toString();
        const userSessions = await guestRepo.findByUserId(ownerId);
        const guestSessionIds = (userSessions || []).map((s) =>
          s._id ? s._id.toString() : s.id ? s.id.toString() : String(s)
        );
        const guestIdStr = guestSessionId.toString();
        if (!guestSessionIds.includes(guestIdStr)) {
          guestSessionIds.push(guestIdStr);
        }
        return {
          journeyType: 'user',
          userId: ownerId,
          guestSessionIds,
        };
      }

      return {
        journeyType: 'guest',
        userId: null,
        guestSessionIds: [guestSessionId.toString()],
      };
    }

    return {
      journeyType: 'anonymous',
      userId: null,
      guestSessionIds: [],
    };
  },

  /**
   * Fetches unified, chronologically ordered events for a journey.
   * Uses deterministic sorting: occurredAt ASC, eventId ASC.
   */
  async getJourneyEvents(
    identity,
    { limit = 500, repo = eventRepository, guestRepo = guestSessionRepository } = {}
  ) {
    const resolved = await this.resolveJourneyIdentifiers(identity, guestRepo);

    const events = await repo.findJourneyEvents({
      userId: resolved.userId,
      guestSessionIds: resolved.guestSessionIds,
      limit,
    });

    return {
      journeyType: resolved.journeyType,
      userId: resolved.userId,
      guestSessionIds: resolved.guestSessionIds,
      events,
    };
  },

  /**
   * Computes the normalized journey summary and attribution.
   */
  async getJourneySummary(
    identity,
    { includeTimeline = false, repo = eventRepository, guestRepo = guestSessionRepository } = {}
  ) {
    const resolved = await this.resolveJourneyIdentifiers(identity, guestRepo);

    const journeyId =
      resolved.journeyType === 'user'
        ? (resolved.userId.startsWith('user_') ? resolved.userId : `user_${resolved.userId}`)
        : resolved.guestSessionIds[0]
        ? (resolved.guestSessionIds[0].startsWith('guest_')
            ? resolved.guestSessionIds[0]
            : `guest_${resolved.guestSessionIds[0]}`)
        : 'anonymous';

    const events = await repo.findJourneyEvents({
      userId: resolved.userId,
      guestSessionIds: resolved.guestSessionIds,
    });

    if (includeTimeline) {
      return formatJourneyDetails({
        journeyId,
        identityType: resolved.journeyType,
        events,
      });
    }

    return formatJourneySummary({
      journeyId,
      identityType: resolved.journeyType,
      events,
    });
  },
};
