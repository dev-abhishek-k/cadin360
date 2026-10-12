import {
  EVENT_TYPES,
  BROWSER_ALLOWED_EVENT_TYPES,
  CANONICAL_ROUTE_LABELS,
  EVENT_LIMITS,
} from './event.constants.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export function validateEventInput(body = {}, { isBrowser = true } = {}) {
  const {
    eventId,
    type,
    occurredAt,
    canonicalRoute,
    originalRoute,
    exerciseName,
    source,
    metadata,
  } = body;

  // 1. eventId validation
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'eventId is required and must be a non-empty string');
  }
  const cleanEventId = eventId.trim();
  if (cleanEventId.length > EVENT_LIMITS.EVENT_ID_MAX_LENGTH) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `eventId exceeds maximum length of ${EVENT_LIMITS.EVENT_ID_MAX_LENGTH} characters`
    );
  }

  // 2. type validation
  if (!type || typeof type !== 'string') {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'type is required');
  }
  const cleanType = type.trim();
  if (!Object.values(EVENT_TYPES).includes(cleanType)) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Unsupported event type: ${cleanType}`);
  }

  // Payment protection: browser ingestion cannot submit payment_completed directly
  if (isBrowser && cleanType === EVENT_TYPES.PAYMENT_COMPLETED) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Browser event ingestion cannot submit payment_completed directly. Payment must be verified via server flow.'
    );
  }

  // 3. occurredAt timestamp validation
  if (!occurredAt) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'occurredAt is required');
  }
  const date = new Date(occurredAt);
  const timeMs = date.getTime();
  if (isNaN(timeMs)) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'occurredAt must be a valid ISO timestamp');
  }

  const now = Date.now();
  if (timeMs > now + EVENT_LIMITS.MAX_FUTURE_TOLERANCE_MS) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'occurredAt cannot be an unreasonable future timestamp');
  }
  if (timeMs < EVENT_LIMITS.MIN_TIMESTAMP_MS) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'occurredAt timestamp is too far in the past');
  }

  // 4. canonicalRoute validation
  if (!canonicalRoute || typeof canonicalRoute !== 'string' || !canonicalRoute.trim()) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'canonicalRoute is required');
  }
  const cleanCanonicalRoute = canonicalRoute.trim();
  if (!cleanCanonicalRoute.startsWith('/')) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'canonicalRoute must begin with a forward slash (/)');
  }
  if (cleanCanonicalRoute.length > EVENT_LIMITS.ROUTE_MAX_LENGTH) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `canonicalRoute exceeds maximum length of ${EVENT_LIMITS.ROUTE_MAX_LENGTH} characters`
    );
  }

  // 5. originalRoute
  const cleanOriginalRoute =
    typeof originalRoute === 'string' && originalRoute.trim()
      ? originalRoute.trim()
      : cleanCanonicalRoute;

  if (cleanOriginalRoute.length > EVENT_LIMITS.ROUTE_MAX_LENGTH) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `originalRoute exceeds maximum length of ${EVENT_LIMITS.ROUTE_MAX_LENGTH} characters`
    );
  }

  // Canonical route label mapping
  const canonicalLabel = CANONICAL_ROUTE_LABELS[cleanCanonicalRoute] || null;

  // 6. exerciseName & source length enforcement
  let cleanExerciseName = null;
  if (exerciseName !== undefined && exerciseName !== null) {
    if (typeof exerciseName !== 'string') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'exerciseName must be a string');
    }
    cleanExerciseName = exerciseName.trim();
    if (cleanExerciseName.length > EVENT_LIMITS.EXERCISE_NAME_MAX_LENGTH) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `exerciseName exceeds maximum length of ${EVENT_LIMITS.EXERCISE_NAME_MAX_LENGTH} characters`
      );
    }
  }

  let cleanSource = null;
  if (source !== undefined && source !== null) {
    if (typeof source !== 'string') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'source must be a string');
    }
    cleanSource = source.trim();
    if (cleanSource.length > EVENT_LIMITS.SOURCE_MAX_LENGTH) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `source exceeds maximum length of ${EVENT_LIMITS.SOURCE_MAX_LENGTH} characters`
      );
    }
  }

  return {
    eventId: cleanEventId,
    type: cleanType,
    occurredAt: date, // Normalized Date object in UTC
    canonicalRoute: cleanCanonicalRoute,
    originalRoute: cleanOriginalRoute,
    canonicalLabel,
    exerciseName: cleanExerciseName,
    source: cleanSource,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
}

export function areImmutableFieldsEqual(existingDoc, newPayload) {
  if (!existingDoc || !newPayload) return false;

  // 1. eventId
  if (existingDoc.eventId !== newPayload.eventId) return false;

  // 2. type
  if (existingDoc.type !== newPayload.type) return false;

  // 3. occurredAt
  const existingTime = new Date(existingDoc.occurredAt).getTime();
  const newTime = new Date(newPayload.occurredAt).getTime();
  if (existingTime !== newTime) return false;

  // 4. canonicalRoute
  if (existingDoc.canonicalRoute !== newPayload.canonicalRoute) return false;

  // 5. originalRoute
  const existingOriginal = existingDoc.originalRoute || existingDoc.canonicalRoute;
  const newOriginal = newPayload.originalRoute || newPayload.canonicalRoute;
  if (existingOriginal !== newOriginal) return false;

  // 6. exerciseName
  const existingEx = existingDoc.exerciseName || null;
  const newEx = newPayload.exerciseName || null;
  if (existingEx !== newEx) return false;

  // 7. source
  const existingSrc = existingDoc.source || null;
  const newSrc = newPayload.source || null;
  if (existingSrc !== newSrc) return false;

  // 8. userId
  const existingUserId = existingDoc.userId ? existingDoc.userId.toString() : null;
  const newUserId = newPayload.userId ? newPayload.userId.toString() : null;
  if (existingUserId !== newUserId) return false;

  // 9. guestSessionId
  const existingGuestId = existingDoc.guestSessionId ? existingDoc.guestSessionId.toString() : null;
  const newGuestId = newPayload.guestSessionId ? newPayload.guestSessionId.toString() : null;
  if (existingGuestId !== newGuestId) return false;

  return true;
}
