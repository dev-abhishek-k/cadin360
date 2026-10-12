import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapCanonicalRoute,
  calculateJourneyStages,
  calculateJourneyStageDetails,
  calculateActivityBounds,
  calculateFirstSource,
  formatJourneySummary,
} from '../../modules/events/journey.service.js';
import { EVENT_TYPES } from '../../modules/events/event.constants.js';

test('Unit: Route normalization logic', () => {
  // Canonical route aliases
  assert.equal(mapCanonicalRoute('/guest-dashboard/cad-practice/2d'), '2D Exercises');
  assert.equal(mapCanonicalRoute('/user-dashboard/cad-practice/2d'), '2D Exercises');
  assert.equal(mapCanonicalRoute('/guest-dashboard/cad-practice/3d'), '3D Exercises');
  assert.equal(mapCanonicalRoute('/user-dashboard/cad-practice/3d'), '3D Exercises');
  assert.equal(mapCanonicalRoute('/pricing'), 'Plans');

  // Query params and hash handling
  assert.equal(mapCanonicalRoute('/pricing?ref=promo#checkout'), 'Plans');
  assert.equal(mapCanonicalRoute('/guest-dashboard/cad-practice/2d?source=yt'), '2D Exercises');

  // Unknown or arbitrary routes return null safely
  assert.equal(mapCanonicalRoute('/unknown-route'), null);
  assert.equal(mapCanonicalRoute('/home'), null);
  assert.equal(mapCanonicalRoute(null), null);
  assert.equal(mapCanonicalRoute(undefined), null);
  assert.equal(mapCanonicalRoute(''), null);
});

test('Unit: Stage calculation independence and payment verification requirement', () => {
  // Empty events
  const emptyStages = calculateJourneyStages([]);
  assert.deepEqual(emptyStages, {
    arrived: false,
    explored: false,
    signedUp: false,
    paid: false,
  });

  // Independent stages: Only signed up, never arrived or explored
  const signupOnly = calculateJourneyStages([
    { type: EVENT_TYPES.SIGNUP_COMPLETED, occurredAt: new Date() },
  ]);
  assert.deepEqual(signupOnly, {
    arrived: false,
    explored: false,
    signedUp: true,
    paid: false,
  });

  // Unverified payment cannot mark paid
  const unverifiedPayment = calculateJourneyStages([
    {
      type: EVENT_TYPES.PAYMENT_COMPLETED,
      occurredAt: new Date(),
      metadata: { verified: false },
    },
  ]);
  assert.equal(unverifiedPayment.paid, false);

  // Verified payment marks paid
  const verifiedPayment = calculateJourneyStages([
    {
      type: EVENT_TYPES.PAYMENT_COMPLETED,
      occurredAt: new Date(),
      paymentVerification: { status: 'verified', paymentId: 'pay_att_123' },
    },
  ]);
  assert.equal(verifiedPayment.paid, true);
});

test('Unit: calculateJourneyStageDetails provides reached timestamps', () => {
  const t1 = new Date('2026-10-12T09:00:00.000Z');
  const t2 = new Date('2026-10-12T09:05:00.000Z');

  const details = calculateJourneyStageDetails([
    { type: EVENT_TYPES.SHORT_LINK_OPENED, occurredAt: t1 },
    { type: EVENT_TYPES.PAGE_VIEWED, occurredAt: t2 },
  ]);

  assert.equal(details.arrived.reached, true);
  assert.equal(details.arrived.reachedAt, t1.toISOString());
  assert.equal(details.explored.reached, true);
  assert.equal(details.explored.reachedAt, t2.toISOString());
  assert.equal(details.signedUp.reached, false);
  assert.equal(details.signedUp.reachedAt, null);
  assert.equal(details.paid.reached, false);
  assert.equal(details.paid.reachedAt, null);
});

test('Unit: Activity bounds calculation and duplicate delivery protection', () => {
  // Empty array
  const emptyBounds = calculateActivityBounds([]);
  assert.deepEqual(emptyBounds, {
    firstActivityAt: null,
    lastActivityAt: null,
    uniqueEventCount: 0,
  });

  const t1 = new Date('2026-10-12T08:00:00.000Z');
  const t2 = new Date('2026-10-12T09:00:00.000Z');

  // 3 deliveries, but 2 share the same eventId (duplicate delivery)
  const events = [
    { eventId: 'evt_1', occurredAt: t1 },
    { eventId: 'evt_1', occurredAt: t1 }, // duplicate
    { eventId: 'evt_2', occurredAt: t2 },
  ];

  const bounds = calculateActivityBounds(events);
  assert.equal(bounds.firstActivityAt, t1.toISOString());
  assert.equal(bounds.lastActivityAt, t2.toISOString());
  assert.equal(bounds.uniqueEventCount, 2, 'Duplicate delivery should not inflate unique event count');
});

test('Unit: First source attribution policy', () => {
  // No events
  assert.equal(calculateFirstSource([]), null);

  // No short_link_opened events
  assert.equal(
    calculateFirstSource([
      { type: EVENT_TYPES.PAGE_VIEWED, source: 'google' },
    ]),
    null
  );

  // Earliest short_link_opened has valid source
  assert.equal(
    calculateFirstSource([
      { type: EVENT_TYPES.SHORT_LINK_OPENED, source: 'youtube' },
      { type: EVENT_TYPES.SHORT_LINK_OPENED, source: 'google' },
    ]),
    'youtube'
  );

  // Missing source policy: If earliest has null source, never substitute a later event
  assert.equal(
    calculateFirstSource([
      { type: EVENT_TYPES.SHORT_LINK_OPENED, source: null },
      { type: EVENT_TYPES.SHORT_LINK_OPENED, source: 'linkedin' },
    ]),
    null
  );
});

test('Unit: Deterministic sorting and tie-breaker by occurredAt then eventId', () => {
  const t1 = new Date('2026-10-12T10:00:00.000Z');
  const t2 = new Date('2026-10-12T10:00:00.000Z'); // Identical timestamp!

  const unsorted = [
    { eventId: 'evt_zebra', occurredAt: t2 },
    { eventId: 'evt_apple', occurredAt: t1 },
  ];

  const sorted = [...unsorted].sort((a, b) => {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (diff !== 0) return diff;
    return a.eventId.localeCompare(b.eventId);
  });

  assert.equal(sorted[0].eventId, 'evt_apple');
  assert.equal(sorted[1].eventId, 'evt_zebra');
});

test('Unit: Module 4 / Section 10 End-to-End Regression Flow', () => {
  // Scenario:
  // - 09:00: YouTube short link (delayed arrival)
  // - 09:01: 2D exercise viewed (delivered twice)
  // - 09:03: Signup completed
  // - 09:04: User-side 2D exercise viewed
  const t0900 = new Date('2026-10-12T09:00:00.000Z');
  const t0901 = new Date('2026-10-12T09:01:00.000Z');
  const t0903 = new Date('2026-10-12T09:03:00.000Z');
  const t0904 = new Date('2026-10-12T09:04:00.000Z');

  const rawEvents = [
    {
      eventId: 'evt_yt_0900',
      type: EVENT_TYPES.SHORT_LINK_OPENED,
      occurredAt: t0900,
      source: 'youtube',
      canonicalRoute: '/pricing',
    },
    {
      eventId: 'evt_2d_0901',
      type: EVENT_TYPES.PAGE_VIEWED,
      occurredAt: t0901,
      canonicalRoute: '/guest-dashboard/cad-practice/2d',
    },
    {
      eventId: 'evt_2d_0901', // duplicate delivery of 09:01
      type: EVENT_TYPES.PAGE_VIEWED,
      occurredAt: t0901,
      canonicalRoute: '/guest-dashboard/cad-practice/2d',
    },
    {
      eventId: 'evt_signup_0903',
      type: EVENT_TYPES.SIGNUP_COMPLETED,
      occurredAt: t0903,
      canonicalRoute: '/register',
    },
    {
      eventId: 'evt_user_2d_0904',
      type: EVENT_TYPES.PAGE_VIEWED,
      occurredAt: t0904,
      canonicalRoute: '/user-dashboard/cad-practice/2d',
    },
  ];

  // Sort chronologically with tie-breaker
  const sorted = [...rawEvents].sort((a, b) => {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (diff !== 0) return diff;
    return a.eventId.localeCompare(b.eventId);
  });

  const summary = formatJourneySummary({
    journeyId: 'user_u_scenario_test',
    identityType: 'user',
    events: sorted,
  });

  // Verify:
  // 1. Exactly 4 unique events (duplicate 09:01 does not inflate count)
  assert.equal(summary.uniqueEventCount, 4);

  // 2. First source is YouTube
  assert.equal(summary.firstSource, 'youtube');

  // 3. Activity bounds
  assert.equal(summary.firstActivityAt, t0900.toISOString());
  assert.equal(summary.lastActivityAt, t0904.toISOString());

  // 4. Stages: Arrived, Explored, SignedUp reached, Paid NOT reached
  assert.deepEqual(summary.stages, {
    arrived: true,
    explored: true,
    signedUp: true,
    paid: false,
  });
});
