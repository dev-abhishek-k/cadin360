import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app.js';
import { eventRepository } from '../../modules/events/event.repository.js';
import { userRepository } from '../../modules/auth/user.repository.js';
import { guestSessionRepository } from '../../modules/guestSession/guestSession.repository.js';
import { authService } from '../../modules/auth/auth.service.js';
import { guestSessionService } from '../../modules/guestSession/guestSession.service.js';
import {
  journeyService,
  mapCanonicalRoute,
  calculateJourneyStages,
  calculateActivityBounds,
  calculateFirstSource,
} from '../../modules/events/journey.service.js';
import { EVENT_TYPES } from '../../modules/events/event.constants.js';

const app = createApp({ nodeEnv: 'test' });

// In-memory test stores
const userStore = new Map();
const guestStore = new Map();
const eventStore = new Map();

// Wire userRepository
userRepository.create = async (userData) => {
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    _id: id,
    id,
    name: userData.name,
    email: userData.email.toLowerCase().trim(),
    passwordHash: userData.passwordHash || (await bcrypt.hash(userData.password || 'Pass123!', 10)),
    role: userData.role || 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  userStore.set(record.email, record);
  return record;
};

userRepository.findByEmail = async (email, { includePassword = false } = {}) => {
  const user = userStore.get(email.toLowerCase().trim());
  if (!user) return null;
  if (!includePassword) {
    const { passwordHash: _p, ...rest } = user;
    return rest;
  }
  return { ...user };
};

userRepository.findById = async (id) => {
  for (const user of userStore.values()) {
    if (user.id === id || user._id === id) {
      const { passwordHash: _p, ...rest } = user;
      return rest;
    }
  }
  return null;
};

userRepository.deleteById = async (id) => {
  for (const [email, user] of userStore.entries()) {
    if (user.id === id || user._id === id) {
      userStore.delete(email);
      return true;
    }
  }
  return false;
};

// Wire guestSessionRepository
guestSessionRepository.create = async (data) => {
  const id = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    _id: id,
    id,
    credentialHash: data.credentialHash,
    associatedUserId: data.associatedUserId || null,
    expiresAt: data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: data.revokedAt || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  guestStore.set(data.credentialHash, record);
  return record;
};

guestSessionRepository.findByCredentialHash = async (credentialHash) => {
  const session = guestStore.get(credentialHash);
  return session ? { ...session } : null;
};

guestSessionRepository.findById = async (id) => {
  for (const session of guestStore.values()) {
    if (session.id === id || session._id === id) return { ...session };
  }
  return null;
};

guestSessionRepository.findByUserId = async (userId) => {
  const matching = [];
  const targetStr = userId.toString();
  for (const session of guestStore.values()) {
    if (session.associatedUserId && session.associatedUserId.toString() === targetStr) {
      matching.push({ ...session });
    }
  }
  return matching;
};

guestSessionRepository.claimSessionAtomically = async (credentialHash, userId) => {
  const session = guestStore.get(credentialHash);
  if (!session || session.associatedUserId !== null) return null;
  session.associatedUserId = userId;
  session.updatedAt = new Date();
  guestStore.set(credentialHash, session);
  return { ...session };
};

// Wire eventRepository
eventRepository.create = async (eventData) => {
  if (eventStore.has(eventData.eventId)) {
    const error = new Error(
      `E11000 duplicate key error collection: cadin360.events index: eventId_1 dup key: { eventId: "${eventData.eventId}" }`
    );
    error.code = 11000;
    error.name = 'MongoServerError';
    throw error;
  }
  const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    _id: id,
    id,
    ...eventData,
    occurredAt: new Date(eventData.occurredAt),
    receivedAt: eventData.receivedAt || new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  eventStore.set(eventData.eventId, record);
  return record;
};

eventRepository.findByEventId = async (eventId) => {
  const event = eventStore.get(eventId);
  return event ? { ...event } : null;
};

eventRepository.findJourneyEvents = async ({
  userId = null,
  guestSessionId = null,
  guestSessionIds = [],
} = {}) => {
  const allGuestIds = [];
  if (guestSessionId) allGuestIds.push(guestSessionId.toString());
  if (Array.isArray(guestSessionIds)) {
    for (const id of guestSessionIds) {
      if (id && !allGuestIds.includes(id.toString())) {
        allGuestIds.push(id.toString());
      }
    }
  }

  const matching = [];
  for (const event of eventStore.values()) {
    const matchesUser = userId && event.userId && event.userId.toString() === userId.toString();
    const matchesGuest =
      event.guestSessionId && allGuestIds.includes(event.guestSessionId.toString());
    if (matchesUser || matchesGuest) {
      matching.push({ ...event });
    }
  }

  // Deterministic sorting: occurredAt ASC, eventId ASC
  return matching.sort((a, b) => {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (diff !== 0) return diff;
    return a.eventId.localeCompare(b.eventId);
  });
};

function generateTestToken(userId, email = 'user.m4@example.com') {
  return authService.generateToken({
    _id: userId,
    email,
    role: 'user',
  });
}

// -------------------------------------------------------------
// MODULE 4 AUTOMATED TEST SUITE
// -------------------------------------------------------------

test('1. A guest without an account resolves to one guest journey', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  const resolved = await journeyService.resolveJourneyIdentifiers({
    guestSessionId: guestSession.id,
  });

  assert.equal(resolved.journeyType, 'guest');
  assert.equal(resolved.userId, null);
  assert.equal(resolved.guestSessionIds.length, 1);
  assert.equal(resolved.guestSessionIds[0], guestSession.id);

  const summary = await journeyService.getJourneySummary({
    guestSessionId: guestSession.id,
  });
  assert.equal(summary.identityType, 'guest');
  assert.match(summary.journeyId, /^guest_/);
});

test('2. A registered user with one guest session resolves to one combined journey', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  const user = await userRepository.create({
    name: 'Single Guest User',
    email: 'single.guest@test.com',
    password: 'Password123!',
  });
  await guestSessionService.associateGuestSessionWithUser(guestCredential, user.id);

  const resolved = await journeyService.resolveJourneyIdentifiers({
    userId: user.id,
  });

  assert.equal(resolved.journeyType, 'user');
  assert.equal(resolved.userId, user.id);
  assert.equal(resolved.guestSessionIds.length, 1);
  assert.equal(resolved.guestSessionIds[0], guestSession.id);

  const summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.identityType, 'user');
  assert.equal(summary.journeyId, `user_${user.id}`);
});

test('3. A registered user with multiple guest sessions resolves to one journey', async () => {
  const g1 = await request(app).post('/api/guest-sessions').send({});
  const g2 = await request(app).post('/api/guest-sessions').send({});

  const user = await userRepository.create({
    name: 'Multi Guest User',
    email: 'multi.guest@test.com',
    password: 'Password123!',
  });

  await guestSessionService.associateGuestSessionWithUser(g1.body.data.guestCredential, user.id);
  await guestSessionService.associateGuestSessionWithUser(g2.body.data.guestCredential, user.id);

  const resolved = await journeyService.resolveJourneyIdentifiers({ userId: user.id });

  assert.equal(resolved.journeyType, 'user');
  assert.equal(resolved.guestSessionIds.length, 2);
  assert.ok(resolved.guestSessionIds.includes(g1.body.data.guestSession.id));
  assert.ok(resolved.guestSessionIds.includes(g2.body.data.guestSession.id));

  const summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.identityType, 'user');
  assert.equal(summary.journeyId, `user_${user.id}`);
});

test('4. Associated guest sessions are not returned as separate journeys', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  const user = await userRepository.create({
    name: 'Owner Redirect',
    email: 'owner.redirect@test.com',
    password: 'Password123!',
  });
  await guestSessionService.associateGuestSessionWithUser(guestCredential, user.id);

  // When resolving by the guestSessionId of an already claimed session:
  const resolved = await journeyService.resolveJourneyIdentifiers({
    guestSessionId: guestSession.id,
  });

  // Must redirect to the user's unified journey, never return a separate guest journey
  assert.equal(resolved.journeyType, 'user');
  assert.equal(resolved.userId, user.id);
  assert.ok(resolved.guestSessionIds.includes(guestSession.id));
});

test('5. Historical guest and user events are both included', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  // Guest event
  await eventRepository.create({
    eventId: `evt_m4_g_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T08:30:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    guestSessionId: guestSession.id,
  });

  const user = await userRepository.create({
    name: 'Both User',
    email: 'both.user@test.com',
    password: 'Password123!',
  });
  await guestSessionService.associateGuestSessionWithUser(guestCredential, user.id);

  // User event
  await eventRepository.create({
    eventId: `evt_m4_u_${Date.now()}`,
    type: 'exercise_submitted',
    occurredAt: '2026-10-12T08:45:00.000Z',
    canonicalRoute: '/user-dashboard/cad-practice/2d',
    userId: user.id,
  });

  const summary = await journeyService.getJourneySummary(
    { userId: user.id },
    { includeTimeline: true }
  );

  assert.equal(summary.uniqueEventCount, 2);
  assert.equal(summary.timeline.length, 2);
  assert.equal(summary.timeline[0].type, 'page_viewed');
  assert.equal(summary.timeline[1].type, 'exercise_submitted');
});

test('6. Events are sorted by occurredAt and then eventId', async () => {
  const user = await userRepository.create({
    name: 'Sorting User',
    email: 'sort.user@test.com',
    password: 'Password123!',
  });

  // Same occurredAt timestamp with deterministic eventId tie-breaker
  await eventRepository.create({
    eventId: 'evt_sort_z',
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
    userId: user.id,
  });
  await eventRepository.create({
    eventId: 'evt_sort_a',
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
    userId: user.id,
  });
  await eventRepository.create({
    eventId: 'evt_sort_first',
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:00:00.000Z',
    canonicalRoute: '/pricing',
    userId: user.id,
  });

  const summary = await journeyService.getJourneySummary(
    { userId: user.id },
    { includeTimeline: true }
  );

  assert.equal(summary.timeline[0].eventId, 'evt_sort_first'); // 09:00
  assert.equal(summary.timeline[1].eventId, 'evt_sort_a'); // 10:00, tie-breaker 'a' before 'z'
  assert.equal(summary.timeline[2].eventId, 'evt_sort_z'); // 10:00
});

test('7. Delayed events correctly update first and last activity', async () => {
  const user = await userRepository.create({
    name: 'Delayed Bounds User',
    email: 'delayed.bounds@test.com',
    password: 'Password123!',
  });

  // Initial event at 10:00
  await eventRepository.create({
    eventId: `evt_bound_mid_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
    userId: user.id,
  });

  let summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstActivityAt, '2026-10-12T10:00:00.000Z');
  assert.equal(summary.lastActivityAt, '2026-10-12T10:00:00.000Z');

  // Delayed earlier event arriving at 09:15
  await eventRepository.create({
    eventId: `evt_bound_early_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:15:00.000Z',
    canonicalRoute: '/pricing',
    userId: user.id,
  });

  summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstActivityAt, '2026-10-12T09:15:00.000Z'); // Updated!
  assert.equal(summary.lastActivityAt, '2026-10-12T10:00:00.000Z');

  // Delayed later event arriving at 11:30
  await eventRepository.create({
    eventId: `evt_bound_late_${Date.now()}`,
    type: 'exercise_submitted',
    occurredAt: '2026-10-12T11:30:00.000Z',
    canonicalRoute: '/user-dashboard/cad-practice/2d',
    userId: user.id,
  });

  summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstActivityAt, '2026-10-12T09:15:00.000Z');
  assert.equal(summary.lastActivityAt, '2026-10-12T11:30:00.000Z'); // Updated!
});

test('8. First source is determined by the earliest short_link_opened event', async () => {
  const user = await userRepository.create({
    name: 'Source User',
    email: 'source.user@test.com',
    password: 'Password123!',
  });

  await eventRepository.create({
    eventId: `evt_src_1_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T08:00:00.000Z',
    canonicalRoute: '/pricing',
    source: 'linkedin_campaign',
    userId: user.id,
  });
  await eventRepository.create({
    eventId: `evt_src_2_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T08:15:00.000Z',
    canonicalRoute: '/pricing',
    source: 'twitter_ads',
    userId: user.id,
  });

  const summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstSource, 'linkedin_campaign');
});

test('9. A delayed earlier source event changes attribution correctly', async () => {
  const user = await userRepository.create({
    name: 'Delayed Source User',
    email: 'delayed.source@test.com',
    password: 'Password123!',
  });

  // First received event (timestamp 09:30)
  await eventRepository.create({
    eventId: `evt_src_later_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:30:00.000Z',
    canonicalRoute: '/pricing',
    source: 'google_search',
    userId: user.id,
  });

  let summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstSource, 'google_search');

  // Delayed event arriving later, but occurred earlier at 08:45
  await eventRepository.create({
    eventId: `evt_src_earlier_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T08:45:00.000Z',
    canonicalRoute: '/pricing',
    source: 'youtube_cad_video',
    userId: user.id,
  });

  summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstSource, 'youtube_cad_video'); // Updated to earlier source!
});

test('10. A later direct visit does not overwrite first-source attribution', async () => {
  const user = await userRepository.create({
    name: 'Direct Visit User',
    email: 'direct.visit@test.com',
    password: 'Password123!',
  });

  // Initial link opening
  await eventRepository.create({
    eventId: `evt_init_link_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:00:00.000Z',
    canonicalRoute: '/pricing',
    source: 'newsletter_october',
    userId: user.id,
  });

  // Later direct visit with empty/no source
  await eventRepository.create({
    eventId: `evt_direct_nav_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/user-dashboard/cad-practice/2d',
    source: null,
    userId: user.id,
  });

  const summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstSource, 'newsletter_october');
});

test('11. No qualifying link-opening event results in firstSource: null', async () => {
  const user = await userRepository.create({
    name: 'No Link User',
    email: 'nolink.user@test.com',
    password: 'Password123!',
  });

  await eventRepository.create({
    eventId: `evt_nl_1_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    userId: user.id,
  });

  const summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.firstSource, null);
});

test('12. An earliest qualifying event without source follows the documented policy', async () => {
  const user = await userRepository.create({
    name: 'Empty Source Policy User',
    email: 'empty.source@test.com',
    password: 'Password123!',
  });

  // Earliest link opening has no source specified
  await eventRepository.create({
    eventId: `evt_empty_src_1_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:00:00.000Z',
    canonicalRoute: '/pricing',
    source: null,
    userId: user.id,
  });

  // Later link opening has a source
  await eventRepository.create({
    eventId: `evt_empty_src_2_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:10:00.000Z',
    canonicalRoute: '/pricing',
    source: 'later_source',
    userId: user.id,
  });

  const summary = await journeyService.getJourneySummary({ userId: user.id });
  // Per documented policy: if earliest qualifying link opening has no source, return null. Never substitute a later event.
  assert.equal(summary.firstSource, null);
});

test('13. 2D and 3D route aliases share the correct labels', () => {
  // 2D routes
  assert.equal(mapCanonicalRoute('/guest-dashboard/cad-practice/2d'), '2D Exercises');
  assert.equal(mapCanonicalRoute('/user-dashboard/cad-practice/2d'), '2D Exercises');

  // 3D routes
  assert.equal(mapCanonicalRoute('/guest-dashboard/cad-practice/3d'), '3D Exercises');
  assert.equal(mapCanonicalRoute('/user-dashboard/cad-practice/3d'), '3D Exercises');

  // Pricing
  assert.equal(mapCanonicalRoute('/pricing'), 'Plans');

  // Unknown route
  assert.equal(mapCanonicalRoute('/unrecognized/route'), null);
});

test('14. Original route information is preserved', async () => {
  const user = await userRepository.create({
    name: 'Orig Route User',
    email: 'orig.route@test.com',
    password: 'Password123!',
  });

  await eventRepository.create({
    eventId: `evt_orig_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    originalRoute: '/guest-dashboard/cad-practice/2d?utm_campaign=winter_cad',
    userId: user.id,
  });

  const details = await journeyService.getJourneySummary(
    { userId: user.id },
    { includeTimeline: true }
  );

  assert.equal(details.timeline[0].canonicalRoute, '/guest-dashboard/cad-practice/2d');
  assert.equal(
    details.timeline[0].originalRoute,
    '/guest-dashboard/cad-practice/2d?utm_campaign=winter_cad'
  );
  assert.equal(details.timeline[0].canonicalLabel, '2D Exercises');
});

test('15. Distinct navigation events remain visible', async () => {
  const user = await userRepository.create({
    name: 'Distinct Nav User',
    email: 'distinct.nav@test.com',
    password: 'Password123!',
  });

  // Two distinct navigation events that share the same label '2D Exercises'
  await eventRepository.create({
    eventId: `evt_nav_1_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    userId: user.id,
  });
  await eventRepository.create({
    eventId: `evt_nav_2_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:05:00.000Z',
    canonicalRoute: '/user-dashboard/cad-practice/2d',
    userId: user.id,
  });

  const details = await journeyService.getJourneySummary(
    { userId: user.id },
    { includeTimeline: true }
  );

  assert.equal(details.timeline.length, 2);
  assert.notEqual(details.timeline[0].eventId, details.timeline[1].eventId);
  assert.equal(details.timeline[0].canonicalLabel, '2D Exercises');
  assert.equal(details.timeline[1].canonicalLabel, '2D Exercises');
});

test('16. Stage badges are computed independently', () => {
  // Scenario: Explored & SignedUp without Arrived or Paid
  const stages = calculateJourneyStages([
    { type: EVENT_TYPES.PAGE_VIEWED },
    { type: EVENT_TYPES.SIGNUP_COMPLETED },
  ]);

  assert.equal(stages.arrived, false);
  assert.equal(stages.explored, true);
  assert.equal(stages.signedUp, true);
  assert.equal(stages.paid, false);
});

test('17. Unverified payment events cannot reach Paid', () => {
  // Unverified payment event
  const unverifiedStages = calculateJourneyStages([
    {
      type: EVENT_TYPES.PAYMENT_COMPLETED,
      metadata: { verified: false },
    },
  ]);
  assert.equal(unverifiedStages.paid, false);

  // Verified payment event
  const verifiedStages = calculateJourneyStages([
    {
      type: EVENT_TYPES.PAYMENT_COMPLETED,
      paymentVerification: { status: 'verified', paymentId: 'pay_123' },
    },
  ]);
  assert.equal(verifiedStages.paid, true);
});

test('18. Unique event counts do not include duplicate records', async () => {
  const user = await userRepository.create({
    name: 'Unique Count User',
    email: 'unique.count@test.com',
    password: 'Password123!',
  });

  const evtId = `evt_retry_test_${Date.now()}`;
  await eventRepository.create({
    eventId: evtId,
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
    userId: user.id,
  });

  // Calculate summary
  const summary = await journeyService.getJourneySummary({ userId: user.id });
  assert.equal(summary.uniqueEventCount, 1);
});

test('19. Empty journeys return safe values', () => {
  const bounds = calculateActivityBounds([]);
  assert.equal(bounds.firstActivityAt, null);
  assert.equal(bounds.lastActivityAt, null);
  assert.equal(bounds.uniqueEventCount, 0);

  const stages = calculateJourneyStages([]);
  assert.deepEqual(stages, {
    arrived: false,
    explored: false,
    signedUp: false,
    paid: false,
  });

  const source = calculateFirstSource([]);
  assert.equal(source, null);
});

test('20. The service does not expose credentials or sensitive fields', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  const user = await userRepository.create({
    name: 'Secure Profile User',
    email: 'secure.profile@test.com',
    password: 'Password123!',
  });
  await guestSessionService.associateGuestSessionWithUser(guestCredential, user.id);

  const token = generateTestToken(user.id, user.email);

  const res = await request(app)
    .get('/api/events/journey/summary')
    .set('Authorization', `Bearer ${token}`)
    .query({ includeTimeline: 'true' });

  assert.equal(res.status, 200);
  const jsonStr = JSON.stringify(res.body);

  assert.ok(!jsonStr.includes('credentialHash'), 'Must not expose credentialHash');
  assert.ok(!jsonStr.includes('passwordHash'), 'Must not expose passwordHash');
  assert.ok(!jsonStr.includes(guestCredential), 'Must not expose raw guestCredential');
});

// -------------------------------------------------------------
// REQUIRED SECTION 10 EXAMPLE SCENARIO TEST
// -------------------------------------------------------------
test('Delayed YouTube arrival and duplicate 2D visits merge into one signup journey', async () => {
  // 1. Create Guest A
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  // 2. 09:01: Guest A views the 2D exercise page
  const evt0901Id = `evt_scen_2d_guest_${Date.now()}`;
  const evt0901 = {
    eventId: evt0901Id,
    type: 'page_viewed',
    occurredAt: '2026-10-12T09:01:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    originalRoute: '/guest-dashboard/cad-practice/2d',
  };
  const res0901 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evt0901);
  assert.equal(res0901.status, 201);

  // 3. 09:01 event is retried twice (Case B: identical immutable retries)
  const retry1 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evt0901);
  assert.equal(retry1.status, 200);
  assert.equal(retry1.body.duplicate, true);

  const retry2 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evt0901);
  assert.equal(retry2.status, 200);
  assert.equal(retry2.body.duplicate, true);

  // 4. 09:03: Guest A completes signup
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Guest A Converted',
      email: 'guest.a.converted@test.com',
      password: 'Password123!',
      guestCredential,
    });
  assert.equal(signupRes.status, 201);
  const token = signupRes.body.data.token;
  const userId = signupRes.body.data.user.id;

  // Record signup_completed event at 09:03
  const evt0903Id = `evt_scen_signup_${Date.now()}`;
  await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      eventId: evt0903Id,
      type: 'signup_completed',
      occurredAt: '2026-10-12T09:03:00.000Z',
      canonicalRoute: '/user-dashboard',
    });

  // 5. 09:04: Registered user visits the 2D exercise page
  const evt0904Id = `evt_scen_2d_user_${Date.now()}`;
  await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      eventId: evt0904Id,
      type: 'page_viewed',
      occurredAt: '2026-10-12T09:04:00.000Z',
      canonicalRoute: '/user-dashboard/cad-practice/2d',
      originalRoute: '/user-dashboard/cad-practice/2d',
    });

  // 6. The 09:00 event is DELIVERED LATE (after 09:04!)
  const evt0900Id = `evt_scen_yt_late_${Date.now()}`;
  await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send({
      eventId: evt0900Id,
      type: 'short_link_opened',
      occurredAt: '2026-10-12T09:00:00.000Z',
      canonicalRoute: '/pricing',
      source: 'youtube',
    });

  // 7. Verify the complete calculated journey
  const journeyRes = await request(app)
    .get('/api/events/journey/summary')
    .set('Authorization', `Bearer ${token}`)
    .query({ includeTimeline: 'true' });

  assert.equal(journeyRes.status, 200);
  const data = journeyRes.body.data;

  // Requirement: Exactly one logical user journey
  assert.equal(data.identityType, 'user');
  assert.equal(data.journeyId, `user_${userId}`);

  // Requirement: Exactly four unique events
  assert.equal(data.uniqueEventCount, 4);
  assert.equal(data.timeline.length, 4);

  // Requirement: First source is YouTube
  assert.equal(data.firstSource, 'youtube');

  // Requirement: Two distinct 2D visit events remain visible
  const visit2DEvents = data.timeline.filter((e) => e.canonicalLabel === '2D Exercises');
  assert.equal(visit2DEvents.length, 2);
  assert.notEqual(visit2DEvents[0].eventId, visit2DEvents[1].eventId);
  assert.equal(visit2DEvents[0].canonicalRoute, '/guest-dashboard/cad-practice/2d');
  assert.equal(visit2DEvents[1].canonicalRoute, '/user-dashboard/cad-practice/2d');

  // Requirement: Arrived, Explored and Signed up are reached; Paid is not reached
  assert.deepEqual(data.stages, {
    arrived: true,
    explored: true,
    signedUp: true,
    paid: false,
  });

  // Requirement: Timeline order follows occurredAt (not receivedAt)
  assert.equal(data.timeline[0].eventId, evt0900Id); // 09:00 (received late)
  assert.equal(data.timeline[0].type, 'short_link_opened');
  assert.equal(data.timeline[1].eventId, evt0901Id); // 09:01
  assert.equal(data.timeline[1].type, 'page_viewed');
  assert.equal(data.timeline[2].eventId, evt0903Id); // 09:03
  assert.equal(data.timeline[2].type, 'signup_completed');
  assert.equal(data.timeline[3].eventId, evt0904Id); // 09:04
  assert.equal(data.timeline[3].type, 'page_viewed');

  assert.equal(data.firstActivityAt, '2026-10-12T09:00:00.000Z');
  assert.equal(data.lastActivityAt, '2026-10-12T09:04:00.000Z');
});
