import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { createApp } from '../../app.js';
import { AUTH_CONFIG } from '../../modules/auth/auth.constants.js';
import { EVENT_TYPES } from '../../modules/events/event.constants.js';
import { eventRepository } from '../../modules/events/event.repository.js';
import { guestSessionRepository } from '../../modules/guestSession/guestSession.repository.js';
import { userRepository } from '../../modules/auth/user.repository.js';
import { mockPaymentAttemptRepository } from '../../modules/payments/mockPaymentAttempt.repository.js';
import { adminJourneyRepository } from '../../modules/admin/admin.repository.js';
import { MOCK_PLANS, PAYMENT_STATUS, SIMULATION_OUTCOMES } from '../../modules/payments/mockPayment.constants.js';

const app = createApp({ nodeEnv: 'test' });
const JWT_SECRET = process.env.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET;

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

test('Mock payment creation, verification, and idempotency', async (t) => {
  // Test Stores
  const attemptStore = new Map();
  const eventStore = new Map();
  const guestStore = new Map();
  const userStore = new Map();

  // Wire up repositories with in-memory stores
  mockPaymentAttemptRepository.create = async (data) => {
    const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      _id: id,
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    attemptStore.set(data.paymentAttemptId, record);
    return { ...record };
  };

  mockPaymentAttemptRepository.findByPaymentAttemptId = async (id) => {
    const rec = attemptStore.get(id);
    return rec ? { ...rec } : null;
  };

  mockPaymentAttemptRepository.updateStatusAtomically = async (paymentAttemptId, expectedStatus, updates) => {
    const rec = attemptStore.get(paymentAttemptId);
    if (!rec || rec.status !== expectedStatus) {
      return null;
    }
    const updated = {
      ...rec,
      ...updates,
      updatedAt: new Date(),
    };
    attemptStore.set(paymentAttemptId, updated);
    return { ...updated };
  };

  mockPaymentAttemptRepository.updateById = async (id, updates) => {
    for (const [key, val] of attemptStore.entries()) {
      if (val._id === id || val.id === id) {
        const updated = { ...val, ...updates, updatedAt: new Date() };
        attemptStore.set(key, updated);
        return updated;
      }
    }
    return null;
  };

  eventRepository.create = async (eventData) => {
    if (eventStore.has(eventData.eventId)) {
      const error = new Error(`E11000 duplicate key error: ${eventData.eventId}`);
      error.code = 11000;
      error.name = 'MongoServerError';
      throw error;
    }
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      _id: id,
      id,
      ...eventData,
      occurredAt: new Date(eventData.occurredAt),
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    eventStore.set(eventData.eventId, record);
    return { ...record };
  };

  eventRepository.findByEventId = async (eventId) => {
    const rec = eventStore.get(eventId);
    return rec ? { ...rec } : null;
  };

  eventRepository.findJourneyEvents = async ({ userId = null, guestSessionId = null }) => {
    const results = [];
    for (const evt of eventStore.values()) {
      const matchUser = userId && evt.userId && evt.userId.toString() === userId.toString();
      const matchGuest = guestSessionId && evt.guestSessionId && evt.guestSessionId.toString() === guestSessionId.toString();
      if (matchUser || matchGuest) {
        results.push({ ...evt });
      }
    }
    return results.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  };

  guestSessionRepository.findByCredentialHash = async (hash) => {
    return guestStore.get(hash) || null;
  };

  guestSessionRepository.findSessionsByUserId = async (uid) => {
    const matching = [];
    for (const sess of guestStore.values()) {
      if (sess.associatedUserId && sess.associatedUserId.toString() === uid.toString()) {
        matching.push(sess);
      }
    }
    return matching;
  };

  userRepository.findById = async (uid) => {
    return userStore.get(uid) || null;
  };

  // Setup Users and Guest Sessions
  const aliceId = 'u_alice_pay';
  const bobId = 'u_bob_pay';
  const adminId = 'u_admin_pay';

  const aliceToken = generateToken({ id: aliceId, name: 'Alice', email: 'alice@test.com', role: 'user' });
  const bobToken = generateToken({ id: bobId, name: 'Bob', email: 'bob@test.com', role: 'user' });
  const adminToken = generateToken({ id: adminId, name: 'Admin', email: 'admin@cadin360.com', role: 'admin' });

  userStore.set(aliceId, { _id: aliceId, id: aliceId, name: 'Alice', email: 'alice@test.com', role: 'user' });
  userStore.set(bobId, { _id: bobId, id: bobId, name: 'Bob', email: 'bob@test.com', role: 'user' });
  userStore.set(adminId, { _id: adminId, id: adminId, name: 'Admin', email: 'admin@cadin360.com', role: 'admin' });

  // Guest Session
  const guestRawCred = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const guestHash = crypto.createHash('sha256').update(guestRawCred).digest('hex');
  const guestSessionDoc = {
    _id: 'g_session_alice',
    id: 'g_session_alice',
    credentialHash: guestHash,
    associatedUserId: null,
    createdAt: new Date(),
  };
  guestStore.set(guestHash, guestSessionDoc);

  // Hook adminJourneyRepository for journey detail reading
  adminJourneyRepository.findUserById = async (id) => userStore.get(id) || null;
  adminJourneyRepository.findGuestSessionById = async (id) => guestSessionDoc;
  adminJourneyRepository.findGuestSessionsByUserId = async (uid) => [];
  adminJourneyRepository.findEventsForJourney = async ({ userId, guestSessionIds = [] }) => {
    const list = [];
    for (const evt of eventStore.values()) {
      if (userId && evt.userId === userId) list.push({ ...evt });
      if (guestSessionIds && guestSessionIds.includes(evt.guestSessionId)) list.push({ ...evt });
    }
    return list.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  };
  adminJourneyRepository.findEventsByJourney = adminJourneyRepository.findEventsForJourney;

  // --- TESTS ---

  // 1. Valid plan creates a pending payment attempt
  await t.test('1. Valid plan creates a pending payment attempt', async () => {
    const res = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'pro' });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.planId, 'pro');
    assert.equal(res.body.data.planName, MOCK_PLANS.pro.name);
    assert.equal(res.body.data.amount, MOCK_PLANS.pro.amount);
    assert.equal(res.body.data.currency, 'USD');
    assert.equal(res.body.data.status, PAYMENT_STATUS.PENDING);
    assert.ok(res.body.data.paymentAttemptId.startsWith('pay_att_'));
  });

  // 2. Invalid plan is rejected
  await t.test('2. Invalid plan is rejected with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'ultra_nonexistent_plan' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Invalid or unsupported plan/i);
  });

  // 3. Backend amount and currency are authoritative
  await t.test('3. Backend amount and currency are authoritative (client overrides ignored)', async () => {
    const res = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        planId: 'starter',
        amount: 1.00, // malicious client attempt to discount
        currency: 'EUR',
      });

    assert.equal(res.status, 201);
    // Must strictly match server config for starter: $29 USD
    assert.equal(res.body.data.amount, MOCK_PLANS.starter.amount);
    assert.equal(res.body.data.currency, 'USD');
    assert.notEqual(res.body.data.amount, 1.00);
  });

  // 4. Anonymous or unauthorized callers cannot access protected attempts
  await t.test('4. Anonymous callers without authentication or guest credential receive 401', async () => {
    const res = await request(app)
      .post('/api/mock-payments')
      .send({ planId: 'pro' });

    assert.equal(res.status, 401);
  });

  // 5. One visitor cannot access another visitor's payment attempt
  await t.test('5. One visitor cannot access another visitor\'s payment attempt (403 Forbidden)', async () => {
    // Alice creates an attempt
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'pro' });
    const attemptId = createRes.body.data.paymentAttemptId;

    // Bob tries to simulate Alice's attempt
    const bobSimRes = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ outcome: 'success' });
    assert.equal(bobSimRes.status, 403);
    assert.match(bobSimRes.body.message, /Access denied/i);

    // Bob tries to read Alice's attempt status
    const bobGetRes = await request(app)
      .get(`/api/mock-payments/${attemptId}`)
      .set('Authorization', `Bearer ${bobToken}`);
    assert.equal(bobGetRes.status, 403);
  });

  // 6. Verified mock success produces one payment_completed event
  await t.test('6. Verified mock success produces one payment_completed event', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'basic' });
    const attemptId = createRes.body.data.paymentAttemptId;

    const simRes = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'success' });

    assert.equal(simRes.status, 200);
    assert.equal(simRes.body.success, true);
    assert.equal(simRes.body.verified, true);
    assert.equal(simRes.body.data.status, PAYMENT_STATUS.SUCCEEDED);
    assert.ok(simRes.body.event);
    assert.equal(simRes.body.event.type, EVENT_TYPES.PAYMENT_COMPLETED);
    assert.equal(simRes.body.event.metadata.verified, true);
    assert.equal(simRes.body.event.metadata.paymentAttemptId, attemptId);

    // Check event in repository
    const storedEvent = eventStore.get(`pay_evt_${attemptId}`);
    assert.ok(storedEvent);
    assert.equal(storedEvent.type, EVENT_TYPES.PAYMENT_COMPLETED);
  });

  // 7. Verified mock failure does not produce payment_completed
  await t.test('7. Verified mock failure transitions attempt to failed and produces NO event', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'pro' });
    const attemptId = createRes.body.data.paymentAttemptId;

    const simRes = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'failure', simulateFailureReason: 'Insufficient test funds' });

    assert.equal(simRes.status, 200);
    assert.equal(simRes.body.verified, false);
    assert.equal(simRes.body.data.status, PAYMENT_STATUS.FAILED);
    assert.equal(simRes.body.event, null);

    // Verify event was NOT created
    assert.equal(eventStore.get(`pay_evt_${attemptId}`), undefined);
  });

  // 8. Browser event ingestion rejects payment_completed
  await t.test('8. Browser event ingestion rejects payment_completed directly (HTTP 400)', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        eventId: 'browser_forged_pay_1',
        type: EVENT_TYPES.PAYMENT_COMPLETED,
        occurredAt: new Date().toISOString(),
        canonicalRoute: '/checkout',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Browser event ingestion cannot submit payment_completed directly/i);
  });

  // 9. Client-supplied success: true cannot bypass server-side verification
  await t.test('9. Client-supplied success: true cannot bypass server-side verification', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'enterprise' });
    const attemptId = createRes.body.data.paymentAttemptId;

    // Client maliciously passes outcome: 'failure' but success: true
    const simRes = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'failure', success: true, verified: true });

    assert.equal(simRes.status, 200);
    assert.equal(simRes.body.verified, false);
    assert.equal(simRes.body.data.status, PAYMENT_STATUS.FAILED);
    assert.equal(simRes.body.event, null);
    assert.equal(eventStore.get(`pay_evt_${attemptId}`), undefined);
  });

  // 10. Client-supplied verified: true cannot bypass verification
  await t.test('10. Client-supplied verified: true cannot force success without valid outcome', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'basic' });
    const attemptId = createRes.body.data.paymentAttemptId;

    const simRes = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'invalid_outcome', verified: true });

    assert.equal(simRes.status, 400);
  });

  // 11. Repeated successful requests do not duplicate payment events
  await t.test('11. Repeated successful requests do not duplicate payment events (idempotency)', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'starter' });
    const attemptId = createRes.body.data.paymentAttemptId;

    const initialEventsCount = eventStore.size;

    // First success
    const res1 = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'success' });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.duplicate, false);
    assert.equal(eventStore.size, initialEventsCount + 1);

    // Second success retry
    const res2 = await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'success' });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.duplicate, true);
    assert.equal(eventStore.size, initialEventsCount + 1, 'Event count must not increase on retry');
  });

  // 12. Concurrent success requests produce at most one successful payment event
  await t.test('12. Concurrent success requests produce at most one successful payment event', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'pro' });
    const attemptId = createRes.body.data.paymentAttemptId;

    const initialEventsCount = eventStore.size;

    // Fire 3 simultaneous requests
    const responses = await Promise.all([
      request(app).post(`/api/mock-payments/${attemptId}/simulate`).set('Authorization', `Bearer ${aliceToken}`).send({ outcome: 'success' }),
      request(app).post(`/api/mock-payments/${attemptId}/simulate`).set('Authorization', `Bearer ${aliceToken}`).send({ outcome: 'success' }),
      request(app).post(`/api/mock-payments/${attemptId}/simulate`).set('Authorization', `Bearer ${aliceToken}`).send({ outcome: 'success' }),
    ]);

    for (const res of responses) {
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    }

    // Exactly one created, others duplicate
    const nonDuplicates = responses.filter((r) => r.body.duplicate === false);
    assert.equal(nonDuplicates.length, 1, 'Exactly one concurrent call should be the creator');
    assert.equal(eventStore.size, initialEventsCount + 1);
  });

  // 13. Finalized attempts cannot be changed to conflicting states
  await t.test('13. Finalized attempts cannot be changed to conflicting states (409 Conflict)', async () => {
    // Succeeded attempt cannot be failed
    const createRes1 = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'basic' });
    const attemptId1 = createRes1.body.data.paymentAttemptId;

    await request(app)
      .post(`/api/mock-payments/${attemptId1}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'success' });

    const conflictFailRes = await request(app)
      .post(`/api/mock-payments/${attemptId1}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'failure' });
    assert.equal(conflictFailRes.status, 409);

    // Failed attempt cannot be succeeded
    const createRes2 = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'starter' });
    const attemptId2 = createRes2.body.data.paymentAttemptId;

    await request(app)
      .post(`/api/mock-payments/${attemptId2}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'failure' });

    const conflictSuccessRes = await request(app)
      .post(`/api/mock-payments/${attemptId2}/simulate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ outcome: 'success' });
    assert.equal(conflictSuccessRes.status, 409);
  });

  // 14. A failed payment does not mark the journey as Paid
  await t.test('14. A failed payment does not mark the journey as Paid', async () => {
    // Bob creates and fails a payment
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ planId: 'basic' });
    const attemptId = createRes.body.data.paymentAttemptId;

    await request(app)
      .post(`/api/mock-payments/${attemptId}/simulate`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ outcome: 'failure' });

    // Check Bob's journey summary
    const summaryRes = await request(app)
      .get('/api/events/journey/summary')
      .set('Authorization', `Bearer ${bobToken}`);

    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.data.stages.paid, false);
  });

  // 15. A successful verified payment updates the journey stage
  await t.test('15. A successful verified payment updates the journey stage to Paid', async () => {
    const summaryRes = await request(app)
      .get('/api/events/journey/summary')
      .set('Authorization', `Bearer ${aliceToken}`);

    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.data.stages.paid, true);
  });

  // 16. The admin dashboard and timeline can read the verified result through existing services
  await t.test('16. The admin dashboard and timeline can read the verified result', async () => {
    const adminTimelineRes = await request(app)
      .get(`/api/admin/journeys/user_${aliceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(adminTimelineRes.status, 200);
    assert.equal(adminTimelineRes.body.data.stages.paid, true);
    const timelineEvents = adminTimelineRes.body.data.timeline;
    const paymentEvt = timelineEvents.find((e) => e.type === EVENT_TYPES.PAYMENT_COMPLETED);
    assert.ok(paymentEvt, 'Timeline must include verified payment_completed event');
    assert.equal(paymentEvt.metadata.verified, true);
  });

  // 17. API responses do not expose sensitive data
  await t.test('17. API responses do not expose sensitive verification secrets or credentials', async () => {
    const createRes = await request(app)
      .post('/api/mock-payments')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ planId: 'pro' });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.verificationReference, undefined, 'Must not expose verificationReference');

    const getRes = await request(app)
      .get(`/api/mock-payments/${createRes.body.data.paymentAttemptId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.verificationReference, undefined);
  });
});
