export const EVENT_TYPES = Object.freeze({
  SHORT_LINK_OPENED: 'short_link_opened',
  PAGE_VIEWED: 'page_viewed',
  EXERCISE_STARTED: 'exercise_started',
  EXERCISE_SUBMITTED: 'exercise_submitted',
  SIGNUP_COMPLETED: 'signup_completed',
  PLAN_VIEWED: 'plan_viewed',
  PAYMENT_COMPLETED: 'payment_completed',
});

// Browser events allow all except payment_completed
export const BROWSER_ALLOWED_EVENT_TYPES = Object.freeze(
  Object.values(EVENT_TYPES).filter((t) => t !== EVENT_TYPES.PAYMENT_COMPLETED)
);

export const CANONICAL_ROUTE_LABELS = Object.freeze({
  '/guest-dashboard/cad-practice/2d': '2D Exercises',
  '/user-dashboard/cad-practice/2d': '2D Exercises',
  '/guest-dashboard/cad-practice/3d': '3D Exercises',
  '/user-dashboard/cad-practice/3d': '3D Exercises',
  '/pricing': 'Plans',
});

export const EVENT_LIMITS = Object.freeze({
  EVENT_ID_MAX_LENGTH: 64,
  ROUTE_MAX_LENGTH: 256,
  EXERCISE_NAME_MAX_LENGTH: 100,
  SOURCE_MAX_LENGTH: 100,
  MAX_FUTURE_TOLERANCE_MS: 5 * 60 * 1000, // 5 minutes maximum forward clock skew
  MIN_TIMESTAMP_MS: new Date('2020-01-01T00:00:00.000Z').getTime(),
});

// List of immutable fields compared during idempotent retry duplicate checks
export const IMMUTABLE_EVENT_FIELDS = Object.freeze([
  'eventId',
  'type',
  'canonicalRoute',
  'originalRoute',
  'exerciseName',
  'source',
  'guestSessionId',
  'userId',
]);
