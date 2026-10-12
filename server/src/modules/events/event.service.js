import { eventRepository } from './event.repository.js';
import { guestSessionRepository } from '../guestSession/guestSession.repository.js';
import { guestSessionService } from '../guestSession/guestSession.service.js';
import { journeyService } from './journey.service.js';
import { validateEventInput, areImmutableFieldsEqual } from './event.validator.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const eventService = {
  async resolveIdentity({ user = null, rawGuestCredential = null } = {}, guestRepo = guestSessionRepository) {
    let resolvedUserId = null;
    let resolvedGuestSessionId = null;

    // 1. Authenticated User Flow
    if (user && user.id) {
      resolvedUserId = user.id;

      // If user also sent a guest credential, verify ownership
      if (rawGuestCredential && typeof rawGuestCredential === 'string' && rawGuestCredential.trim()) {
        const credentialHash = guestSessionService.hashCredential(rawGuestCredential.trim());
        const session = await guestRepo.findByCredentialHash(credentialHash);

        if (!session || session.revokedAt) {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Supplied guest credential is invalid or revoked');
        }

        if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Supplied guest credential has expired');
        }

        if (session.associatedUserId) {
          const ownerStr = session.associatedUserId.toString();
          if (ownerStr !== resolvedUserId.toString()) {
            // CRITICAL: Never allow one user to write events into another user's guest session
            throw new ApiError(
              HTTP_STATUS.FORBIDDEN,
              'Access denied: cannot record events for another user\'s guest session'
            );
          }
          resolvedGuestSessionId = session._id;
        } else {
          // Claim guest session atomically for the authenticated user
          const claimed = await guestRepo.claimSessionAtomically(credentialHash, resolvedUserId);
          resolvedGuestSessionId = claimed ? claimed._id : session._id;
        }
      }

      return { userId: resolvedUserId, guestSessionId: resolvedGuestSessionId };
    }

    // 2. Guest User Flow
    if (!rawGuestCredential || typeof rawGuestCredential !== 'string' || !rawGuestCredential.trim()) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        'Valid guest-session credential (header x-guest-session-credential) or user authentication required'
      );
    }

    const credentialHash = guestSessionService.hashCredential(rawGuestCredential.trim());
    const session = await guestRepo.findByCredentialHash(credentialHash);

    if (!session || session.revokedAt) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid or revoked guest-session credential');
    }

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Guest session has expired');
    }

    resolvedGuestSessionId = session._id;
    resolvedUserId = session.associatedUserId || null;

    return { userId: resolvedUserId, guestSessionId: resolvedGuestSessionId };
  },

  async ingestEvent(
    body,
    identity,
    { isBrowser = true } = {},
    repo = eventRepository
  ) {
    // 1. Validate payload and normalize routes/timestamps
    const validated = validateEventInput(body, { isBrowser });

    const eventDoc = {
      eventId: validated.eventId,
      type: validated.type,
      occurredAt: validated.occurredAt,
      receivedAt: new Date(),
      canonicalRoute: validated.canonicalRoute,
      originalRoute: validated.originalRoute,
      canonicalLabel: validated.canonicalLabel,
      exerciseName: validated.exerciseName,
      source: validated.source,
      guestSessionId: identity.guestSessionId || null,
      userId: identity.userId || null,
      metadata: validated.metadata || {},
    };

    // 2. Atomic insert and duplicate key collision handling
    try {
      const savedEvent = await repo.create(eventDoc);
      return {
        duplicate: false,
        event: savedEvent,
      };
    } catch (err) {
      // Handle MongoDB unique index collision (E11000) or duplicate eventId
      const isDuplicateKey =
        err.code === 11000 ||
        (err.name === 'MongoServerError' && err.message?.includes('duplicate key')) ||
        err.message?.includes('E11000');

      if (isDuplicateKey) {
        const existing = await repo.findByEventId(validated.eventId);

        if (existing) {
          // Case B: Identical immutable content -> idempotent success
          if (areImmutableFieldsEqual(existing, eventDoc)) {
            return {
              duplicate: true,
              event: existing,
            };
          }

          // Case C: Same eventId but differing immutable content -> 409 Conflict
          throw new ApiError(
            HTTP_STATUS.CONFLICT,
            `Event ID "${validated.eventId}" already exists with conflicting content`
          );
        }
      }

      throw err;
    }
  },

  async getJourneyEvents(
    { userId, guestSessionId },
    repo = eventRepository,
    guestRepo = guestSessionRepository
  ) {
    const result = await journeyService.getJourneyEvents(
      { userId, guestSessionId },
      { repo, guestRepo }
    );
    return result.events;
  },
};
