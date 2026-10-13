import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../app.js';
import { eventRepository } from '../../modules/events/event.repository.js';
import { userRepository } from '../../modules/auth/user.repository.js';
import { guestSessionRepository } from '../../modules/guestSession/guestSession.repository.js';
import { authService } from '../../modules/auth/auth.service.js';

const app = createApp({ nodeEnv: 'test' });

// In-memory test stores
const eventStore = new Map();
const userStore = new Map();
const guestStore = new Map();

// Mock eventRepository with MongoDB duplicate-key behavior
eventRepository.create = async (eventData) => {
  if (eventStore.has(eventData.eventId)) {
    const error = new Error(
      `E11000 duplicate key error collection: cadin360.events index: eventId_1 dup key: { eventId: "${eventData.eventId}" }`
    );
    error.code = 11000;
    error.name = 'MongoServerError';
    throw error;
  }
  const id = `evt-id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

eventRepository.findJourneyEvents = async ({ userId = null, guestSessionId = null }) => {
  const matching = [];
  for (const event of eventStore.values()) {
    const matchesUser = userId && event.userId && event.userId.toString() === userId.toString();
    const matchesGuest =
      guestSessionId && event.guestSessionId && event.guestSessionId.toString() === guestSessionId.toString();
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

guestSessionRepository.claimSessionAtomically = async (credentialHash, userId) => {
  const session = guestStore.get(credentialHash);
  if (!session || session.associatedUserId !== null) return null;
  session.associatedUserId = userId;
  session.updatedAt = new Date();
  guestStore.set(credentialHash, session);
  return { ...session };
};

// Wire userRepository
userRepository.create = async (userData) => {
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    _id: id,
    id,
    name: userData.name,
    email: userData.email.toLowerCase().trim(),
    passwordHash: userData.passwordHash || 'hashed',
    role: userData.role || 'user',
    createdAt: new Date(),
  };
  userStore.set(record.email, record);
  return record;
};

userRepository.findById = async (id) => {
  for (const user of userStore.values()) {
    if (user.id === id || user._id === id) return { ...user };
  }
  return null;
};

test.beforeEach(() => {
  eventStore.clear();
  userStore.clear();
  guestStore.clear();
});

// 1. A valid guest event is saved
test('1. A valid guest event is saved', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  const eventPayload = {
    eventId: 'evt_guest_view_001',
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    source: 'landing_hero',
  };

  const response = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send(eventPayload);

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.duplicate, false);
  assert.equal(response.body.data.eventId, 'evt_guest_view_001');
  assert.equal(response.body.data.canonicalRoute, '/guest-dashboard/cad-practice/2d');
  assert.equal(response.body.data.canonicalLabel, '2D Exercises');
  assert.ok(response.body.data.guestSessionId);
  assert.equal(response.body.data.userId, null);
});

// 2. A valid authenticated-user event is saved
test('2. A valid authenticated-user event is saved', async () => {
  const userId = 'usr_alice_789';
  const token = authService.generateToken({ id: userId, email: 'alice@example.com', role: 'user' });

  const eventPayload = {
    eventId: 'evt_user_ex_001',
    type: 'exercise_started',
    occurredAt: '2026-10-12T10:05:00.000Z',
    canonicalRoute: '/user-dashboard/cad-practice/3d',
    exerciseName: 'Gear Assembly 3D',
  };

  const response = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send(eventPayload);

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.duplicate, false);
  assert.equal(response.body.data.userId, userId);
  assert.equal(response.body.data.canonicalLabel, '3D Exercises');
});

// 3. Unsupported event types are rejected
test('3. Unsupported event types are rejected', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  const response = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_invalid_type_001',
      type: 'user_clicked_random_button',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/pricing',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.ok(response.body.message.includes('Unsupported event type'));
});

// 4. Missing or invalid timestamps are rejected
test('4. Missing or invalid timestamps are rejected (including unreasonable future timestamps)', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  // Missing timestamp
  const missingRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_time_001',
      type: 'page_viewed',
      canonicalRoute: '/pricing',
    });
  assert.equal(missingRes.status, 400);

  // Unparseable timestamp
  const invalidRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_time_002',
      type: 'page_viewed',
      occurredAt: 'not-a-real-date',
      canonicalRoute: '/pricing',
    });
  assert.equal(invalidRes.status, 400);

  // Far future timestamp (> 5 minutes tolerance)
  const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const futureRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_time_003',
      type: 'page_viewed',
      occurredAt: farFuture,
      canonicalRoute: '/pricing',
    });
  assert.equal(futureRes.status, 400);
  assert.ok(futureRes.body.message.includes('future timestamp'));
});

// 5. Invalid routes and excessive field lengths are rejected
test('5. Invalid routes and excessive field lengths are rejected', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  // Invalid route (missing leading slash)
  const badRouteRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_route_001',
      type: 'page_viewed',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: 'pricing', // missing /
    });
  assert.equal(badRouteRes.status, 400);

  // Excessive eventId length (> 64 chars)
  const longIdRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'a'.repeat(70),
      type: 'page_viewed',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/pricing',
    });
  assert.equal(longIdRes.status, 400);

  // Excessive exerciseName length (> 100 chars)
  const longNameRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_name_001',
      type: 'exercise_started',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/guest-dashboard/cad-practice/2d',
      exerciseName: 'x'.repeat(105),
    });
  assert.equal(longNameRes.status, 400);
});

// 6. An identical retry returns success without creating another record
test('6. An identical retry returns success with duplicate: true and does not create another record', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  const payload = {
    eventId: 'evt_idempotent_001',
    type: 'plan_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
    source: 'pricing_banner',
  };

  // First request: HTTP 201 Created
  const res1 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send(payload);

  assert.equal(res1.status, 201);
  assert.equal(res1.body.duplicate, false);
  const initialStoreSize = eventStore.size;

  // Second identical request (retry): HTTP 200 OK with duplicate: true
  const res2 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send(payload);

  assert.equal(res2.status, 200);
  assert.equal(res2.body.duplicate, true);
  assert.equal(res2.body.data.eventId, 'evt_idempotent_001');
  assert.equal(eventStore.size, initialStoreSize, 'No additional record should be created');
});

// 7. Reusing an event ID with changed immutable content returns 409
test('7. Reusing an event ID with changed immutable content returns 409 Conflict', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  // Initial event
  await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_conflict_001',
      type: 'page_viewed',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/pricing',
    });

  // Attempt to submit same eventId with conflicting route
  const conflictRes = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_conflict_001',
      type: 'page_viewed',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/guest-dashboard/cad-practice/2d', // Changed route!
    });

  assert.equal(conflictRes.status, 409);
  assert.equal(conflictRes.body.success, false);
});

// 8. Concurrent identical requests produce exactly one stored event
test('8. Concurrent identical requests produce exactly one stored event', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;

  const payload = {
    eventId: 'evt_concurrent_001',
    type: 'exercise_started',
    occurredAt: '2026-10-12T10:10:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    exerciseName: 'Bolt 2D',
  };

  // Launch 3 concurrent requests simultaneously
  const [resA, resB, resC] = await Promise.all([
    request(app).post('/api/events').set('x-guest-session-credential', credential).send(payload),
    request(app).post('/api/events').set('x-guest-session-credential', credential).send(payload),
    request(app).post('/api/events').set('x-guest-session-credential', credential).send(payload),
  ]);

  const statuses = [resA.status, resB.status, resC.status].sort();
  // Exactly one request must return 201 Created; the other two must return 200 OK duplicate
  assert.deepEqual(statuses, [200, 200, 201]);

  let recordCount = 0;
  for (const ev of eventStore.values()) {
    if (ev.eventId === 'evt_concurrent_001') recordCount++;
  }
  assert.equal(recordCount, 1, 'Exactly one event must be saved in the database');
});

// 9. A user cannot submit events for another user's guest session
test('9. A user cannot submit events for another user\'s guest session', async () => {
  // Create a guest session
  const guestRes = await request(app).post('/api/guest-sessions');
  const credential = guestRes.body.guestCredential;
  const hash = crypto.createHash('sha256').update(credential).digest('hex');

  // Associate this guest session to User 1 (Owner)
  const sessionRecord = guestStore.get(hash);
  sessionRecord.associatedUserId = 'usr_owner_111';
  guestStore.set(hash, sessionRecord);

  // User 2 (Attacker) attempts to record an event using User 1's guest credential
  const user2Token = authService.generateToken({ id: 'usr_attacker_222', email: 'attacker@example.com', role: 'user' });

  const response = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${user2Token}`)
    .set('x-guest-session-credential', credential)
    .send({
      eventId: 'evt_spoof_001',
      type: 'page_viewed',
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/pricing',
    });

  assert.equal(response.status, 403);
  assert.ok(response.body.message.includes('another user'));
});

// 10. Browser-submitted payment_completed events are rejected
test('10. Browser-submitted payment_completed events are rejected', async () => {
  const token = authService.generateToken({ id: 'usr_buyer_333', email: 'buyer@example.com', role: 'user' });

  const response = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      eventId: 'evt_fake_payment_001',
      type: 'payment_completed', // Browser attempting to spoof payment event
      occurredAt: '2026-10-12T10:00:00.000Z',
      canonicalRoute: '/checkout',
      verified: true, // Client flag must be ignored and rejected
    });

  assert.equal(response.status, 400);
  assert.ok(response.body.message.includes('Browser event ingestion cannot submit payment_completed'));
});

// 11. The trusted mock payment flow can create a verified payment event
test('11. The trusted mock payment flow can create a verified payment event', async () => {
  const token = authService.generateToken({ id: 'usr_subscriber_444', email: 'sub@example.com', role: 'user' });

  const response = await request(app)
    .post('/api/payments/verify-mock')
    .set('Authorization', `Bearer ${token}`)
    .send({
      paymentId: 'pay_mock_order_9988',
      amount: 49.99,
      plan: 'Pro Annual',
      currency: 'USD',
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.duplicate, false);
  assert.equal(response.body.data.type, 'payment_completed');
  assert.equal(response.body.data.eventId, 'pay_evt_pay_mock_order_9988');
  assert.equal(response.body.data.userId, 'usr_subscriber_444');
});

// 12. Repeated mock payment verification does not create duplicate events
test('12. Repeated mock payment verification does not create duplicate events', async () => {
  const token = authService.generateToken({ id: 'usr_subscriber_444', email: 'sub@example.com', role: 'user' });
  const paymentPayload = {
    paymentId: 'pay_mock_order_idempotent',
    amount: 99.0,
    plan: 'Enterprise',
  };

  // First verification
  const res1 = await request(app)
    .post('/api/payments/verify-mock')
    .set('Authorization', `Bearer ${token}`)
    .send(paymentPayload);

  assert.equal(res1.status, 201);
  assert.equal(res1.body.duplicate, false);
  const initialStoreSize = eventStore.size;

  // Repeated verification
  const res2 = await request(app)
    .post('/api/payments/verify-mock')
    .set('Authorization', `Bearer ${token}`)
    .send(paymentPayload);

  assert.equal(res2.status, 200);
  assert.equal(res2.body.duplicate, true);
  assert.equal(eventStore.size, initialStoreSize, 'Should not add a second payment event');
});

// 13. Chronological ordering uses occurredAt followed by eventId
test('13. Chronological ordering uses occurredAt ascending followed by eventId as tie-breaker', async () => {
  const token = authService.generateToken({ id: 'usr_timeline_555', email: 'timeline@example.com', role: 'user' });

  // Ingest events out of chronological order with tie-breaking events
  const events = [
    { eventId: 'evt_c', type: 'page_viewed', occurredAt: '2026-10-12T10:10:00.000Z', canonicalRoute: '/pricing' },
    { eventId: 'evt_a', type: 'page_viewed', occurredAt: '2026-10-12T10:00:00.000Z', canonicalRoute: '/user-dashboard/cad-practice/2d' },
    { eventId: 'evt_tie_2', type: 'exercise_started', occurredAt: '2026-10-12T10:05:00.000Z', canonicalRoute: '/user-dashboard/cad-practice/2d' },
    { eventId: 'evt_tie_1', type: 'exercise_submitted', occurredAt: '2026-10-12T10:05:00.000Z', canonicalRoute: '/user-dashboard/cad-practice/2d' },
  ];

  for (const ev of events) {
    const res = await request(app).post('/api/events').set('Authorization', `Bearer ${token}`).send(ev);
    assert.equal(res.status, 201);
  }

  // Retrieve journey events
  const journeyRes = await request(app).get('/api/events/journey').set('Authorization', `Bearer ${token}`);
  assert.equal(journeyRes.status, 200);
  assert.equal(journeyRes.body.data.length, 4);

  const eventIds = journeyRes.body.data.map((e) => e.eventId);
  // Expected order:
  // 1. evt_a (10:00)
  // 2. evt_tie_1 (10:05, tie-breaker 'evt_tie_1' < 'evt_tie_2')
  // 3. evt_tie_2 (10:05)
  // 4. evt_c (10:10)
  assert.deepEqual(eventIds, ['evt_a', 'evt_tie_1', 'evt_tie_2', 'evt_c']);
});

// 14. Identity and role fields supplied by a client cannot forge ownership or privileges
test('14. Identity and role fields supplied by a client cannot forge ownership or privileges', async () => {
  const token = authService.generateToken({ id: 'usr_regular_666', email: 'regular@example.com', role: 'user' });

  const spoofPayload = {
    eventId: 'evt_spoof_attempt_001',
    type: 'page_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
    // Malicious browser fields attempting to spoof identity and admin role
    userId: 'usr_victim_999',
    role: 'admin',
    guestSessionId: 'guest_fake_111',
  };

  const response = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send(spoofPayload);

  assert.equal(response.status, 201);
  assert.equal(response.body.data.userId, 'usr_regular_666', 'Must be authenticated user ID, ignoring client spoofing');
  assert.equal(response.body.data.guestSessionId, null, 'Must ignore client fake guestSessionId');
});
