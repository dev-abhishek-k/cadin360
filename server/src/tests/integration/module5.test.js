import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { adminJourneyRepository } from '../../modules/admin/admin.repository.js';
import { adminJourneyService, parseUtcDateRange } from '../../modules/admin/admin.service.js';
import { AUTH_CONFIG } from '../../modules/auth/auth.constants.js';
import { EVENT_TYPES } from '../../modules/events/event.constants.js';

const app = createApp({ nodeEnv: 'test' });
const JWT_SECRET = process.env.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET;

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

test('Module 5: Admin Journey Dashboard & Attribution Integration Tests', async (t) => {
  const adminToken = generateToken({
    id: 'admin_1',
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

  // Base test data fixture for journeys
  const mockUsers = [
    { _id: 'u_alice', id: 'u_alice', name: 'Alice Smith', email: 'alice@test.com', role: 'user' },
    { _id: 'u_bob', id: 'u_bob', name: 'Bob Jones', email: 'bob@test.com', role: 'user' },
    { _id: 'u_charlie', id: 'u_charlie', name: 'Charlie Brown', email: 'charlie@test.com', role: 'user' },
  ];

  const mockUnassociatedGuestSessions = [
    { _id: 'g_anon_1', id: 'g_anon_1', associatedUserId: null, createdAt: new Date('2026-10-01T00:00:00.000Z') },
    { _id: 'g_anon_2', id: 'g_anon_2', associatedUserId: null, createdAt: new Date('2026-10-02T00:00:00.000Z') },
  ];

  // Helper to build a clean dataset for tests
  function buildTestDataset() {
    return {
      users: [...mockUsers],
      unassociatedGuestSessions: [...mockUnassociatedGuestSessions],
      eventJourneys: [
        // Journey 1: Alice (YouTube attribution, multi-stage: arrived, explored, signedUp)
        {
          _id: 'user_u_alice',
          identityType: 'user',
          userId: 'u_alice',
          guestSessionId: null,
          events: [
            {
              eventId: 'evt_a_1',
              type: EVENT_TYPES.SHORT_LINK_OPENED,
              occurredAt: new Date('2026-10-10T09:00:00.000Z'),
              source: 'youtube',
              canonicalRoute: '/pricing',
              originalRoute: '/pricing?ref=youtube',
            },
            {
              eventId: 'evt_a_2',
              type: EVENT_TYPES.PAGE_VIEWED,
              occurredAt: new Date('2026-10-10T09:05:00.000Z'),
              source: null,
              canonicalRoute: '/user-dashboard/cad-practice/2d',
              originalRoute: '/user-dashboard/cad-practice/2d',
            },
            {
              eventId: 'evt_a_3',
              type: EVENT_TYPES.SIGNUP_COMPLETED,
              occurredAt: new Date('2026-10-10T09:10:00.000Z'),
              source: null,
              canonicalRoute: '/register',
              originalRoute: '/register',
            },
          ],
        },
        // Journey 2: Bob (Google attribution, paid with verified mock payment)
        {
          _id: 'user_u_bob',
          identityType: 'user',
          userId: 'u_bob',
          guestSessionId: null,
          events: [
            {
              eventId: 'evt_b_1',
              type: EVENT_TYPES.SHORT_LINK_OPENED,
              occurredAt: new Date('2026-10-12T10:00:00.000Z'),
              source: 'google',
              canonicalRoute: '/pricing',
              originalRoute: '/pricing?ref=google',
            },
            {
              eventId: 'evt_b_2',
              type: EVENT_TYPES.PAGE_VIEWED,
              occurredAt: new Date('2026-10-12T10:02:00.000Z'),
              source: null,
              canonicalRoute: '/guest-dashboard/cad-practice/3d',
              originalRoute: '/guest-dashboard/cad-practice/3d',
            },
            {
              eventId: 'evt_b_3',
              type: EVENT_TYPES.PAYMENT_COMPLETED,
              occurredAt: new Date('2026-10-12T10:15:00.000Z'),
              source: null,
              canonicalRoute: '/pricing',
              originalRoute: '/pricing',
              paymentVerification: { status: 'verified', paymentId: 'pay_999' },
            },
          ],
        },
        // Journey 3: Charlie (Direct visit, no short link, explored only)
        {
          _id: 'user_u_charlie',
          identityType: 'user',
          userId: 'u_charlie',
          guestSessionId: null,
          events: [
            {
              eventId: 'evt_c_1',
              type: EVENT_TYPES.PAGE_VIEWED,
              occurredAt: new Date('2026-10-15T14:00:00.000Z'),
              source: null,
              canonicalRoute: '/guest-dashboard/cad-practice/2d',
              originalRoute: '/guest-dashboard/cad-practice/2d',
            },
          ],
        },
        // Journey 4: Unassociated Guest 1 (Twitter source, explored)
        {
          _id: 'guest_g_anon_1',
          identityType: 'guest',
          userId: null,
          guestSessionId: 'g_anon_1',
          events: [
            {
              eventId: 'evt_g1_1',
              type: EVENT_TYPES.SHORT_LINK_OPENED,
              occurredAt: new Date('2026-10-05T08:00:00.000Z'),
              source: 'twitter',
              canonicalRoute: '/pricing',
              originalRoute: '/pricing?ref=tw',
            },
            {
              eventId: 'evt_g1_2',
              type: EVENT_TYPES.PAGE_VIEWED,
              occurredAt: new Date('2026-10-05T08:05:00.000Z'),
              source: null,
              canonicalRoute: '/guest-dashboard/cad-practice/2d',
              originalRoute: '/guest-dashboard/cad-practice/2d',
            },
          ],
        },
      ],
    };
  }

  // Wire mock repository for test execution
  adminJourneyRepository.getAdminJourneysData = async () => buildTestDataset();

  // Test 1: Anonymous users cannot access the API (401)
  await t.test('1. Anonymous users cannot access the API', async () => {
    const res = await request(app).get('/api/admin/journeys');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  // Test 2: Non-admin users are rejected (403)
  await t.test('2. Non-admin users are rejected', async () => {
    const res = await request(app)
      .get('/api/admin/journeys')
      .set('Authorization', `Bearer ${userToken}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // Test 3: Admin users can access the dashboard (200)
  await t.test('3. Admin users can access the dashboard', async () => {
    const res = await request(app)
      .get('/api/admin/journeys')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.journeys));
    assert.ok(res.body.data.pagination);
    assert.ok(res.body.data.summaryMetrics);
  });

  // Test 4: Searching by user name works
  await t.test('4. Searching by user name works', async () => {
    const res = await request(app)
      .get('/api/admin/journeys?search=Alice')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.journeys.length, 1);
    assert.equal(res.body.data.journeys[0].displayIdentity, 'Alice Smith');
    assert.equal(res.body.data.journeys[0].journeyId, 'user_u_alice');
  });

  // Test 5: Searching by guest ID works
  await t.test('5. Searching by guest ID works', async () => {
    const res = await request(app)
      .get('/api/admin/journeys?search=g_anon_1')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.journeys.length, 1);
    assert.equal(res.body.data.journeys[0].journeyId, 'guest_g_anon_1');
    assert.equal(res.body.data.journeys[0].identityType, 'guest');
  });

  // Test 6: UTC date boundaries are inclusive
  await t.test('6. UTC date boundaries are inclusive', async () => {
    const { startUtc, endUtc } = parseUtcDateRange('2026-10-10', '2026-10-12');
    assert.equal(startUtc.toISOString(), '2026-10-10T00:00:00.000Z');
    assert.equal(endUtc.toISOString(), '2026-10-12T23:59:59.999Z');

    const res = await request(app)
      .get('/api/admin/journeys?startDate=2026-10-10&endDate=2026-10-12')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    // Alice (Oct 10) and Bob (Oct 12) qualify
    const ids = res.body.data.journeys.map((j) => j.journeyId);
    assert.ok(ids.includes('user_u_alice'));
    assert.ok(ids.includes('user_u_bob'));
    assert.ok(!ids.includes('guest_g_anon_1')); // Oct 5 outside range
  });

  // Test 7: Journeys qualify when at least one event is in the selected date range
  await t.test('7. Journeys qualify when at least one event is in the selected date range', async () => {
    const res = await request(app)
      .get('/api/admin/journeys?startDate=2026-10-05&endDate=2026-10-06')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.journeys.length, 1);
    assert.equal(res.body.data.journeys[0].journeyId, 'guest_g_anon_1');
  });

  // Test 8: Qualified journeys use their complete event history
  await t.test('8. Qualified journeys use their complete event history', async () => {
    // Custom dataset where User has events on Oct 1 (outside range) and Oct 11 (inside range)
    adminJourneyRepository.getAdminJourneysData = async () => ({
      users: [{ _id: 'u_deep', id: 'u_deep', name: 'Deep User', email: 'deep@test.com', role: 'user' }],
      unassociatedGuestSessions: [],
      eventJourneys: [
        {
          _id: 'user_u_deep',
          identityType: 'user',
          userId: 'u_deep',
          guestSessionId: null,
          events: [
            {
              eventId: 'evt_early',
              type: EVENT_TYPES.SHORT_LINK_OPENED,
              occurredAt: new Date('2026-10-01T08:00:00.000Z'), // Outside range
              source: 'linkedin',
            },
            {
              eventId: 'evt_mid',
              type: EVENT_TYPES.PAGE_VIEWED,
              occurredAt: new Date('2026-10-11T12:00:00.000Z'), // Inside range
            },
            {
              eventId: 'evt_late',
              type: EVENT_TYPES.PAGE_VIEWED,
              occurredAt: new Date('2026-10-25T15:00:00.000Z'), // Outside range
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .get('/api/admin/journeys?startDate=2026-10-10&endDate=2026-10-12')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.journeys.length, 1);
    const j = res.body.data.journeys[0];
    // Must use complete history
    assert.equal(j.firstActivityAt, '2026-10-01T08:00:00.000Z');
    assert.equal(j.lastActivityAt, '2026-10-25T15:00:00.000Z');
    assert.equal(j.firstSource, 'linkedin');
    assert.equal(j.uniqueEventCount, 3);

    // Restore dataset
    adminJourneyRepository.getAdminJourneysData = async () => buildTestDataset();
  });

  // Test 9: First-source filtering follows attribution rules
  await t.test('9. First-source filtering follows attribution rules', async () => {
    const resYouTube = await request(app)
      .get('/api/admin/journeys?source=youtube')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resYouTube.status, 200);
    assert.equal(resYouTube.body.data.journeys.length, 1);
    assert.equal(resYouTube.body.data.journeys[0].firstSource, 'youtube');

    const resGoogle = await request(app)
      .get('/api/admin/journeys?source=google')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resGoogle.status, 200);
    assert.equal(resGoogle.body.data.journeys.length, 1);
    assert.equal(resGoogle.body.data.journeys[0].firstSource, 'google');

    const resDirect = await request(app)
      .get('/api/admin/journeys?source=none')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resDirect.status, 200);
    // Charlie (and empty sessions) have no source
    assert.ok(resDirect.body.data.journeys.some((j) => j.journeyId === 'user_u_charlie'));
  });

  // Test 10: Duplicate deliveries do not inflate event counts
  await t.test('10. Duplicate deliveries do not inflate event counts', async () => {
    adminJourneyRepository.getAdminJourneysData = async () => ({
      users: [{ _id: 'u_dup', id: 'u_dup', name: 'Dup User', email: 'dup@test.com', role: 'user' }],
      unassociatedGuestSessions: [],
      eventJourneys: [
        {
          _id: 'user_u_dup',
          identityType: 'user',
          userId: 'u_dup',
          guestSessionId: null,
          events: [
            { eventId: 'evt_dup_1', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-10T09:00:00.000Z') },
            { eventId: 'evt_dup_1', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-10T09:00:00.000Z') }, // Duplicate
            { eventId: 'evt_dup_2', type: EVENT_TYPES.PAGE_VIEWED, occurredAt: new Date('2026-10-10T09:05:00.000Z') },
          ],
        },
      ],
    });

    const res = await request(app)
      .get('/api/admin/journeys?search=Dup')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.journeys[0].uniqueEventCount, 2);

    // Restore dataset
    adminJourneyRepository.getAdminJourneysData = async () => buildTestDataset();
  });

  // Test 11: Associated guest sessions do not appear as separate journeys
  await t.test('11. Associated guest sessions do not appear as separate journeys', async () => {
    // If guest session was associated with Alice, it is merged under user_u_alice
    const res = await request(app)
      .get('/api/admin/journeys')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const guestJourneys = res.body.data.journeys.filter((j) => j.identityType === 'guest');
    // Only unassociated guests appear as guest journeys
    for (const g of guestJourneys) {
      assert.ok(g.journeyId.startsWith('guest_g_anon_'));
    }
  });

  // Test 12: Summary metrics are calculated across the entire filtered result set
  await t.test('12. Summary metrics are calculated across the entire filtered result set', async () => {
    // With limit=1, pagination returns only 1 row, but summaryMetrics must reflect all matching journeys
    const res = await request(app)
      .get('/api/admin/journeys?limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.journeys.length, 1); // 1 row on page
    assert.ok(res.body.data.summaryMetrics.totalJourneys >= 4); // Full filtered total
    assert.equal(res.body.data.summaryMetrics.paid, 1); // Bob is paid
  });

  // Test 13: Pagination and total counts are correct
  await t.test('13. Pagination and total counts are correct', async () => {
    const resPage1 = await request(app)
      .get('/api/admin/journeys?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resPage1.status, 200);
    assert.equal(resPage1.body.data.pagination.page, 1);
    assert.equal(resPage1.body.data.pagination.limit, 2);
    assert.equal(resPage1.body.data.journeys.length, 2);
    assert.equal(resPage1.body.data.pagination.hasNextPage, true);
    assert.equal(resPage1.body.data.pagination.hasPrevPage, false);

    const resPage2 = await request(app)
      .get('/api/admin/journeys?page=2&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resPage2.status, 200);
    assert.equal(resPage2.body.data.pagination.page, 2);
    assert.equal(resPage2.body.data.pagination.hasPrevPage, true);
  });

  // Test 14: Invalid filters and pagination values are safely handled
  await t.test('14. Invalid filters and pagination values are safely handled', async () => {
    // Invalid startDate
    const resInvalidDate = await request(app)
      .get('/api/admin/journeys?startDate=not-a-date')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resInvalidDate.status, 400);

    // Start date after end date
    const resInverted = await request(app)
      .get('/api/admin/journeys?startDate=2026-10-20&endDate=2026-10-10')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resInverted.status, 400);

    // Negative page and excessive limit safely bounded
    const resBounded = await request(app)
      .get('/api/admin/journeys?page=-5&limit=999')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resBounded.status, 200);
    assert.equal(resBounded.body.data.pagination.page, 1);
    assert.equal(resBounded.body.data.pagination.limit, 100); // capped at 100
  });

  // Test 15: Empty results and API failures are handled correctly
  await t.test('15. Empty results and API failures are handled correctly', async () => {
    const resEmpty = await request(app)
      .get('/api/admin/journeys?search=NonExistentVisitor999')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(resEmpty.status, 200);
    assert.equal(resEmpty.body.data.journeys.length, 0);
    assert.equal(resEmpty.body.data.summaryMetrics.totalJourneys, 0);
    assert.equal(resEmpty.body.data.pagination.total, 0);
  });
});
