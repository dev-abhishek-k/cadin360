import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { adminJourneyRepository } from '../../modules/admin/admin.repository.js';
import { AUTH_CONFIG } from '../../modules/auth/auth.constants.js';
import { EVENT_TYPES } from '../../modules/events/event.constants.js';

const app = createApp({ nodeEnv: 'test' });
const JWT_SECRET = process.env.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET;

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

test('Journey details, timeline, milestones, and access control', async (t) => {
  const adminToken = generateToken({
    id: 'admin_super_1',
    name: 'Super Admin',
    email: 'admin@cadin360.test',
    role: 'admin',
  });

  const userToken = generateToken({
    id: 'user_regular_1',
    name: 'Regular User',
    email: 'regular@cadin360.test',
    role: 'user',
  });

  // Test Fixtures
  const mockUserAlice = {
    _id: 'u_alice_123',
    id: 'u_alice_123',
    name: 'Alice Cooper',
    email: 'alice@cadin360.test',
    role: 'user',
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
  };

  const mockUserBob = {
    _id: 'u_bob_456',
    id: 'u_bob_456',
    name: 'Bob Marley',
    email: 'bob@cadin360.test',
    role: 'user',
    createdAt: new Date('2026-10-05T09:00:00.000Z'),
  };

  const mockGuestSession1 = {
    _id: 'g_session_1',
    associatedUserId: 'u_alice_123',
    createdAt: new Date('2026-10-01T07:00:00.000Z'),
  };

  const mockGuestSession2 = {
    _id: 'g_session_2',
    associatedUserId: 'u_alice_123',
    createdAt: new Date('2026-10-01T07:30:00.000Z'),
  };

  const mockGuestOnlySession = {
    _id: 'g_guest_only_99',
    associatedUserId: null,
    createdAt: new Date('2026-10-02T10:00:00.000Z'),
  };

  // 1. Admin can access journey details (200 OK)
  await t.test('1. Admin can access journey details', async () => {
    adminJourneyRepository.findUserById = async (id) => (id === 'u_alice_123' ? mockUserAlice : null);
    adminJourneyRepository.findGuestSessionsByUserId = async () => [mockGuestSession1];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'evt_1',
        type: EVENT_TYPES.SHORT_LINK_OPENED,
        occurredAt: new Date('2026-10-01T07:05:00.000Z'),
        canonicalRoute: '/pricing',
        originalRoute: '/pricing?ref=yt',
        source: 'youtube',
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.journeyId, 'user_u_alice_123');
    assert.equal(res.body.data.displayIdentity, 'Alice Cooper');
    assert.equal(res.body.data.email, 'alice@cadin360.test');
    assert.ok(Array.isArray(res.body.data.timeline));
  });

  // 2. Anonymous users are rejected (401 Unauthorized)
  await t.test('2. Anonymous users are rejected', async () => {
    const res = await request(app).get('/api/admin/journeys/user_u_alice_123');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  // 3. Authenticated non-admin users are rejected (403 Forbidden)
  await t.test('3. Authenticated non-admin users are rejected', async () => {
    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${userToken}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // 4. Invalid journey IDs are handled safely (400 Bad Request)
  await t.test('4. Invalid journey IDs are handled safely', async () => {
    // Blank/empty prefix
    const resEmpty = await request(app)
      .get('/api/admin/journeys/%20%20')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resEmpty.status, 400);

    const resMissingSuffix = await request(app)
      .get('/api/admin/journeys/user_')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resMissingSuffix.status, 400);
  });

  // 5. Unknown journeys return 404 (404 Not Found)
  await t.test('5. Unknown journeys return 404', async () => {
    adminJourneyRepository.findUserById = async () => null;
    adminJourneyRepository.findGuestSessionById = async () => null;

    const res = await request(app)
      .get('/api/admin/journeys/user_unknown_999')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /not found/i);
  });

  // 6. Guest-only journey returns its correct events
  await t.test('6. Guest-only journey returns its correct events', async () => {
    adminJourneyRepository.findGuestSessionById = async (id) =>
      id === 'g_guest_only_99' ? mockGuestOnlySession : null;
    adminJourneyRepository.findEventsForJourney = async ({ guestSessionIds }) => {
      assert.deepEqual(guestSessionIds, ['g_guest_only_99']);
      return [
        {
          eventId: 'evt_g_1',
          type: EVENT_TYPES.PAGE_VIEWED,
          occurredAt: new Date('2026-10-02T10:05:00.000Z'),
          canonicalRoute: '/guest-dashboard/cad-practice/2d',
          originalRoute: '/guest-dashboard/cad-practice/2d',
        },
      ];
    };

    const res = await request(app)
      .get('/api/admin/journeys/guest_g_guest_only_99')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.identityType, 'guest');
    assert.equal(res.body.data.journeyId, 'guest_g_guest_only_99');
    assert.equal(res.body.data.displayIdentity, 'Guest nly_99');
    assert.equal(res.body.data.timeline.length, 1);
    assert.equal(res.body.data.timeline[0].eventId, 'evt_g_1');
  });

  // 7. Registered journey includes events from associated guest sessions
  await t.test('7. Registered journey includes events from associated guest sessions', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [mockGuestSession1];
    adminJourneyRepository.findEventsForJourney = async ({ userId, guestSessionIds }) => {
      assert.equal(userId, 'u_alice_123');
      assert.deepEqual(guestSessionIds, ['g_session_1']);
      return [
        {
          eventId: 'evt_guest_pre',
          type: EVENT_TYPES.SHORT_LINK_OPENED,
          occurredAt: new Date('2026-10-01T07:10:00.000Z'),
          canonicalRoute: '/pricing',
          source: 'twitter',
        },
        {
          eventId: 'evt_user_post',
          type: EVENT_TYPES.SIGNUP_COMPLETED,
          occurredAt: new Date('2026-10-01T08:05:00.000Z'),
          canonicalRoute: '/register',
        },
      ];
    };

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.timeline.length, 2);
    assert.equal(res.body.data.associatedGuestSessionCount, 1);
    assert.equal(res.body.data.associatedGuestSessions[0].guestSessionId, 'g_session_1');
  });

  // 8. One user with multiple associated guest sessions gets one combined logical timeline
  await t.test('8. One user with multiple associated guest sessions gets one combined logical timeline', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [mockGuestSession1, mockGuestSession2];
    adminJourneyRepository.findEventsForJourney = async ({ userId, guestSessionIds }) => {
      assert.equal(userId, 'u_alice_123');
      assert.deepEqual(guestSessionIds, ['g_session_1', 'g_session_2']);
      return [
        {
          eventId: 'evt_g1',
          type: EVENT_TYPES.SHORT_LINK_OPENED,
          occurredAt: new Date('2026-10-01T07:00:00.000Z'),
          canonicalRoute: '/pricing',
        },
        {
          eventId: 'evt_g2',
          type: EVENT_TYPES.PAGE_VIEWED,
          occurredAt: new Date('2026-10-01T07:30:00.000Z'),
          canonicalRoute: '/guest-dashboard/cad-practice/2d',
        },
        {
          eventId: 'evt_u1',
          type: EVENT_TYPES.SIGNUP_COMPLETED,
          occurredAt: new Date('2026-10-01T08:00:00.000Z'),
          canonicalRoute: '/register',
        },
      ];
    };

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.associatedGuestSessionCount, 2);
    assert.equal(res.body.data.timeline.length, 3);
  });

  // 9. No event appears twice
  await t.test('9. No event appears twice', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [mockGuestSession1];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'evt_dup_100',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T07:15:00.000Z'),
        canonicalRoute: '/guest-dashboard/cad-practice/2d',
      },
      {
        eventId: 'evt_dup_100', // Repeated event ID
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T07:15:00.000Z'),
        canonicalRoute: '/guest-dashboard/cad-practice/2d',
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.uniqueEventCount, 1);
    assert.equal(res.body.data.timeline.length, 1);
  });

  // 10. Events are ordered by occurredAt, then eventId
  await t.test('10. Events are ordered by occurredAt, then eventId', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'evt_z',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:00:00.000Z'),
        canonicalRoute: '/guest-dashboard/cad-practice/2d',
      },
      {
        eventId: 'evt_a',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:00:00.000Z'), // Identical timestamp as evt_z
        canonicalRoute: '/guest-dashboard/cad-practice/3d',
      },
      {
        eventId: 'evt_earlier',
        type: EVENT_TYPES.SHORT_LINK_OPENED,
        occurredAt: new Date('2026-10-01T07:00:00.000Z'),
        canonicalRoute: '/pricing',
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    const timeline = res.body.data.timeline;
    assert.equal(timeline[0].eventId, 'evt_earlier');
    assert.equal(timeline[1].eventId, 'evt_a'); // Sorted alphabetically by eventId on equal timestamp
    assert.equal(timeline[2].eventId, 'evt_z');
  });

  // 11. Delayed events are reflected in the correct chronological position
  await t.test('11. Delayed events are reflected in the correct chronological position', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'evt_delayed_earliest',
        type: EVENT_TYPES.SHORT_LINK_OPENED,
        occurredAt: new Date('2026-10-01T06:00:00.000Z'), // Ingested late, occurred early
        canonicalRoute: '/pricing',
        source: 'google',
      },
      {
        eventId: 'evt_regular_middle',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T07:00:00.000Z'),
        canonicalRoute: '/user-dashboard/cad-practice/2d',
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.firstActivityAt, '2026-10-01T06:00:00.000Z');
    assert.equal(res.body.data.firstSource, 'google');
    assert.equal(res.body.data.timeline[0].eventId, 'evt_delayed_earliest');
  });

  // 12. Route aliases display the correct canonical labels
  await t.test('12. Route aliases display the correct canonical labels', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'e1',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:01:00.000Z'),
        canonicalRoute: '/guest-dashboard/cad-practice/2d',
        originalRoute: '/guest-dashboard/cad-practice/2d?lang=en',
      },
      {
        eventId: 'e2',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:02:00.000Z'),
        canonicalRoute: '/user-dashboard/cad-practice/2d',
      },
      {
        eventId: 'e3',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:03:00.000Z'),
        canonicalRoute: '/guest-dashboard/cad-practice/3d',
      },
      {
        eventId: 'e4',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:04:00.000Z'),
        canonicalRoute: '/user-dashboard/cad-practice/3d',
      },
      {
        eventId: 'e5',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:05:00.000Z'),
        canonicalRoute: '/pricing',
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    const tl = res.body.data.timeline;
    assert.equal(tl[0].canonicalLabel, '2D Exercises');
    assert.equal(tl[0].originalRoute, '/guest-dashboard/cad-practice/2d?lang=en');
    assert.equal(tl[1].canonicalLabel, '2D Exercises');
    assert.equal(tl[2].canonicalLabel, '3D Exercises');
    assert.equal(tl[3].canonicalLabel, '3D Exercises');
    assert.equal(tl[4].canonicalLabel, 'Plans');
  });

  // 13. Summary event counts use the complete journey, not just the current page
  await t.test('13. Summary event counts use the complete journey, not just the current page', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      { eventId: 'e1', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:00:00.000Z') },
      { eventId: 'e2', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:01:00.000Z') },
      { eventId: 'e3', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:02:00.000Z') },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.timeline.length, 1); // 1 event on page
    assert.equal(res.body.data.uniqueEventCount, 3); // Full journey count!
    assert.equal(res.body.data.pagination.total, 3);
  });

  // 14. Stage status is derived from the full event history
  await t.test('14. Stage status is derived from the full event history', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      { eventId: 'e1', type: EVENT_TYPES.SHORT_LINK_OPENED, occurredAt: new Date('2026-10-01T08:00:00.000Z') },
      { eventId: 'e2', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:05:00.000Z') },
      { eventId: 'e3', type: EVENT_TYPES.SIGNUP_COMPLETED, occurredAt: new Date('2026-10-01T08:10:00.000Z') },
      {
        eventId: 'e4',
        type: EVENT_TYPES.PAYMENT_COMPLETED,
        occurredAt: new Date('2026-10-01T08:15:00.000Z'),
        paymentVerification: { status: 'verified', paymentId: 'p_1' },
      },
    ];

    // Request with limit=1 (only stage 1 event on this page)
    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.stages.arrived, true);
    assert.equal(res.body.data.stages.explored, true);
    assert.equal(res.body.data.stages.signedUp, true);
    assert.equal(res.body.data.stages.paid, true);
    assert.equal(res.body.data.stageDetails.paid.reached, true);
    assert.equal(res.body.data.stageDetails.paid.reachedAt, '2026-10-01T08:15:00.000Z');
  });

  // 15. Unverified browser payment events cannot make the journey Paid
  await t.test('15. Unverified browser payment events cannot make the journey Paid', async () => {
    adminJourneyRepository.findUserById = async () => mockUserBob;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'fake_payment_event',
        type: EVENT_TYPES.PAYMENT_COMPLETED,
        occurredAt: new Date('2026-10-05T09:10:00.000Z'),
        // No server payment verification present!
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_bob_456')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.stages.paid, false);
    assert.equal(res.body.data.stageDetails.paid.reached, false);
    assert.equal(res.body.data.stageDetails.paid.reachedAt, null);
  });

  // 16. Timeline pagination returns the correct events and totals
  await t.test('16. Timeline pagination returns the correct events and totals', async () => {
    adminJourneyRepository.findUserById = async () => mockUserAlice;
    adminJourneyRepository.findGuestSessionsByUserId = async () => [];
    adminJourneyRepository.findEventsForJourney = async () => [
      { eventId: 'e1', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:00:00.000Z') },
      { eventId: 'e2', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:01:00.000Z') },
      { eventId: 'e3', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-01T08:02:00.000Z') },
    ];

    const res1 = await request(app)
      .get('/api/admin/journeys/user_u_alice_123?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.pagination.page, 1);
    assert.equal(res1.body.data.pagination.limit, 2);
    assert.equal(res1.body.data.pagination.total, 3);
    assert.equal(res1.body.data.pagination.totalPages, 2);
    assert.equal(res1.body.data.pagination.hasNextPage, true);
    assert.equal(res1.body.data.pagination.hasPrevPage, false);
    assert.equal(res1.body.data.timeline.length, 2);
    assert.equal(res1.body.data.timeline[0].eventId, 'e1');
    assert.equal(res1.body.data.timeline[1].eventId, 'e2');

    const res2 = await request(app)
      .get('/api/admin/journeys/user_u_alice_123?page=2&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.data.pagination.page, 2);
    assert.equal(res2.body.data.pagination.hasNextPage, false);
    assert.equal(res2.body.data.pagination.hasPrevPage, true);
    assert.equal(res2.body.data.timeline.length, 1);
    assert.equal(res2.body.data.timeline[0].eventId, 'e3');
  });

  // 17. Secrets and raw guest credentials are not included in responses
  await t.test('17. Secrets and raw guest credentials are not included in responses', async () => {
    adminJourneyRepository.findUserById = async () => ({
      ...mockUserAlice,
      passwordHash: '$2b$10$supersecretpasswordhashthatmustneverleak',
    });
    adminJourneyRepository.findGuestSessionsByUserId = async () => [
      {
        ...mockGuestSession1,
        credentialHash: 'hash_secret_never_leak_credential',
      },
    ];
    adminJourneyRepository.findEventsForJourney = async () => [
      {
        eventId: 'e_secret_check',
        type: EVENT_TYPES.PAGE_VIEWED,
        occurredAt: new Date('2026-10-01T08:00:00.000Z'),
      },
    ];

    const res = await request(app)
      .get('/api/admin/journeys/user_u_alice_123')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('passwordHash'));
    assert.ok(!bodyStr.includes('credentialHash'));
    assert.ok(!bodyStr.includes('supersecretpasswordhashthatmustneverleak'));
    assert.ok(!bodyStr.includes('hash_secret_never_leak_credential'));
  });
});
