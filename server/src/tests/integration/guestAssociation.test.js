import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app.js';
import { eventRepository } from '../../modules/events/event.repository.js';
import { userRepository } from '../../modules/auth/user.repository.js';
import { guestSessionRepository } from '../../modules/guestSession/guestSession.repository.js';
import { authService } from '../../modules/auth/auth.service.js';
import { guestSessionService } from '../../modules/guestSession/guestSession.service.js';

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

function generateTestToken(userId, email = 'user@example.com') {
  return authService.generateToken({
    _id: userId,
    email,
    role: 'user',
  });
}

// -------------------------------------------------------------
// MODULE 3 TEST SUITE
// -------------------------------------------------------------

test('1. A valid unowned guest session can be associated with an authenticated user', async () => {
  // Create unowned guest session
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  assert.equal(guestRes.status, 201);
  const { guestCredential, guestSession } = guestRes.body.data;
  assert.equal(guestSession.associatedUserId, null);

  // Create user
  const user = await userRepository.create({
    name: 'Alice User',
    email: 'alice.m3@test.com',
    password: 'Password123!',
  });
  const token = generateTestToken(user.id, user.email);

  // Associate via POST /api/guest-sessions/associate
  const assocRes = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential });

  assert.equal(assocRes.status, 200);
  assert.equal(assocRes.body.success, true);
  assert.equal(assocRes.body.data.associated, true);
  assert.equal(assocRes.body.data.alreadyAssociated, false);
  assert.equal(assocRes.body.data.guestSession.associatedUserId, user.id);

  // Verify in repository
  const hash = guestSessionService.hashCredential(guestCredential);
  const storedSession = await guestSessionRepository.findByCredentialHash(hash);
  assert.equal(storedSession.associatedUserId, user.id);
});

test('2. The guest historical events remain unchanged after association', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  // Ingest events before association
  const evt1 = {
    eventId: `evt_hist_1_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T09:00:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    source: 'youtube_cad',
  };
  const evt2 = {
    eventId: `evt_hist_2_${Date.now()}`,
    type: 'exercise_started',
    occurredAt: '2026-10-12T09:02:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
    exerciseName: 'Bracket 2D',
  };

  const ing1 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evt1);
  assert.equal(ing1.status, 201);

  const ing2 = await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evt2);
  assert.equal(ing2.status, 201);

  // Snapshot before association
  const before1 = await eventRepository.findByEventId(evt1.eventId);
  const before2 = await eventRepository.findByEventId(evt2.eventId);

  // Associate session with user
  const user = await userRepository.create({
    name: 'Bob Historian',
    email: 'bob.hist@test.com',
    password: 'Password123!',
  });
  const token = generateTestToken(user.id, user.email);

  const assocRes = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential });
  assert.equal(assocRes.status, 200);

  // Snapshot after association: MUST REMAIN UNCHANGED
  const after1 = await eventRepository.findByEventId(evt1.eventId);
  const after2 = await eventRepository.findByEventId(evt2.eventId);

  assert.equal(after1.eventId, before1.eventId);
  assert.equal(after1.occurredAt.toISOString(), before1.occurredAt.toISOString());
  assert.equal(after1.type, before1.type);
  assert.equal(after1.source, before1.source);
  assert.equal(after1.canonicalRoute, before1.canonicalRoute);
  assert.equal(after1.guestSessionId.toString(), before1.guestSessionId.toString());

  assert.equal(after2.eventId, before2.eventId);
  assert.equal(after2.occurredAt.toISOString(), before2.occurredAt.toISOString());
  assert.equal(after2.exerciseName, before2.exerciseName);
});

test('3. Repeated association by the same user succeeds without creating duplicate events', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const user = await userRepository.create({
    name: 'Charlie Repeat',
    email: 'charlie.repeat@test.com',
    password: 'Password123!',
  });
  const token = generateTestToken(user.id, user.email);

  // First association
  const first = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.alreadyAssociated, false);

  const countBefore = eventStore.size;

  // Second association (idempotent retry)
  const second = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential });
  assert.equal(second.status, 200);
  assert.equal(second.body.data.associated, true);
  assert.equal(second.body.data.alreadyAssociated, true);

  // Ensure no duplicate events were created
  assert.equal(eventStore.size, countBefore);
});

test('4. One user can own multiple guest sessions', async () => {
  const g1Res = await request(app).post('/api/guest-sessions').send({});
  const g2Res = await request(app).post('/api/guest-sessions').send({});
  const cred1 = g1Res.body.data.guestCredential;
  const cred2 = g2Res.body.data.guestCredential;

  const user = await userRepository.create({
    name: 'Multi Owner',
    email: 'multi.owner@test.com',
    password: 'Password123!',
  });
  const token = generateTestToken(user.id, user.email);

  // Associate session 1
  const res1 = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential: cred1 });
  assert.equal(res1.status, 200);

  // Associate session 2
  const res2 = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential: cred2 });
  assert.equal(res2.status, 200);

  // Verify user owns both in repository
  const sessions = await guestSessionRepository.findByUserId(user.id);
  assert.equal(sessions.length, 2);
  const ownedIds = sessions.map((s) => s.id);
  assert.ok(ownedIds.includes(g1Res.body.data.guestSession.id));
  assert.ok(ownedIds.includes(g2Res.body.data.guestSession.id));
});

test('5. A second user cannot claim a session owned by the first user', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const user1 = await userRepository.create({
    name: 'Owner One',
    email: 'owner1@test.com',
    password: 'Password123!',
  });
  const user2 = await userRepository.create({
    name: 'Owner Two',
    email: 'owner2@test.com',
    password: 'Password123!',
  });

  const token1 = generateTestToken(user1.id, user1.email);
  const token2 = generateTestToken(user2.id, user2.email);

  // User 1 claims session
  const res1 = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token1}`)
    .send({ guestCredential });
  assert.equal(res1.status, 200);

  // User 2 attempts to claim session owned by User 1 -> 409 Conflict
  const res2 = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token2}`)
    .send({ guestCredential });

  assert.equal(res2.status, 409);
  assert.match(res2.body.message, /already claimed by another user/i);

  // Verify ownership remains strictly with User 1
  const hash = guestSessionService.hashCredential(guestCredential);
  const stored = await guestSessionRepository.findByCredentialHash(hash);
  assert.equal(stored.associatedUserId, user1.id);
});

test('6. Two different users attempting to claim the same session concurrently cannot both succeed', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const userA = await userRepository.create({
    name: 'Concurrent A',
    email: 'concurrent.a@test.com',
    password: 'Password123!',
  });
  const userB = await userRepository.create({
    name: 'Concurrent B',
    email: 'concurrent.b@test.com',
    password: 'Password123!',
  });

  const tokenA = generateTestToken(userA.id, userA.email);
  const tokenB = generateTestToken(userB.id, userB.email);

  // Send simultaneous claim requests
  const [resA, resB] = await Promise.all([
    request(app)
      .post('/api/guest-sessions/associate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ guestCredential }),
    request(app)
      .post('/api/guest-sessions/associate')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ guestCredential }),
  ]);

  const statuses = [resA.status, resB.status];
  assert.ok(statuses.includes(200), 'One request must succeed with 200');
  assert.ok(statuses.includes(409), 'The other request must fail with 409 Conflict');

  // Verify that only one user owns the session in storage
  const hash = guestSessionService.hashCredential(guestCredential);
  const stored = await guestSessionRepository.findByCredentialHash(hash);
  assert.ok(stored.associatedUserId === userA.id || stored.associatedUserId === userB.id);
});

test('7. An invalid guest credential is rejected', async () => {
  const user = await userRepository.create({
    name: 'Invalid Test User',
    email: 'invalid.test@test.com',
    password: 'Password123!',
  });
  const token = generateTestToken(user.id, user.email);

  // 1. Missing credential
  const missingRes = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(missingRes.status, 400);

  // 2. Non-existent credential
  const fakeRes = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential: 'deadbeef'.repeat(8) });
  assert.equal(fakeRes.status, 404);
});

test('8. An unauthenticated caller cannot associate a guest session', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const res = await request(app)
    .post('/api/guest-sessions/associate')
    .send({ guestCredential });

  assert.equal(res.status, 401);
});

test('9. A request body containing another users ID cannot change the association target', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const userReal = await userRepository.create({
    name: 'Real User',
    email: 'real.user@test.com',
    password: 'Password123!',
  });
  const userVictim = await userRepository.create({
    name: 'Victim User',
    email: 'victim.user@test.com',
    password: 'Password123!',
  });

  const tokenReal = generateTestToken(userReal.id, userReal.email);

  // Attacker tries to pass victim's ID in the request body
  const res = await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${tokenReal}`)
    .send({
      guestCredential,
      userId: userVictim.id,
      targetUserId: userVictim.id,
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.guestSession.associatedUserId, userReal.id);

  // Verify in storage that session belongs strictly to userReal
  const hash = guestSessionService.hashCredential(guestCredential);
  const stored = await guestSessionRepository.findByCredentialHash(hash);
  assert.equal(stored.associatedUserId, userReal.id);
  assert.notEqual(stored.associatedUserId, userVictim.id);
});

test('10. Signup with a valid guest credential associates the session correctly', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Signup Assoc User',
      email: 'signup.assoc@test.com',
      password: 'Password123!',
      guestCredential,
    });

  assert.equal(signupRes.status, 201);
  assert.equal(signupRes.body.success, true);
  assert.ok(signupRes.body.data.guestSession);
  assert.equal(signupRes.body.data.guestSession.associatedUserId, signupRes.body.data.user.id);

  // Check storage
  const hash = guestSessionService.hashCredential(guestCredential);
  const stored = await guestSessionRepository.findByCredentialHash(hash);
  assert.equal(stored.associatedUserId, signupRes.body.data.user.id);
});

test('11. Login with a valid guest credential associates the session correctly', async () => {
  // Pre-create user and unowned guest session
  const user = await userRepository.create({
    name: 'Login Assoc User',
    email: 'login.assoc@test.com',
    password: 'Password123!',
  });

  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  // Login providing guestCredential in body
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'login.assoc@test.com',
      password: 'Password123!',
      guestCredential,
    });

  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.success, true);
  assert.ok(loginRes.body.data.guestSession);
  assert.equal(loginRes.body.data.guestSession.associatedUserId, user.id);

  // Verify in storage
  const hash = guestSessionService.hashCredential(guestCredential);
  const stored = await guestSessionRepository.findByCredentialHash(hash);
  assert.equal(stored.associatedUserId, user.id);
});

test('12. Signup/login without a guest credential still works', async () => {
  // Plain signup
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Plain User',
      email: 'plain.user@test.com',
      password: 'Password123!',
    });
  assert.equal(signupRes.status, 201);
  assert.equal(signupRes.body.data.guestSession, undefined);

  // Plain login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'plain.user@test.com',
      password: 'Password123!',
    });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.data.guestSession, undefined);
});

test('13. A failed association never silently reports that association succeeded', async () => {
  // Create guest session and claim by User 1
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const user1 = await userRepository.create({
    name: 'User 1 Claim',
    email: 'user1.claim@test.com',
    password: 'Password123!',
  });
  const token1 = generateTestToken(user1.id, user1.email);
  await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token1}`)
    .send({ guestCredential });

  // Now an attacker tries to register with User 1's guestCredential
  const failedSignup = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Attacker Imposter',
      email: 'imposter@test.com',
      password: 'Password123!',
      guestCredential,
    });

  // Must reject with 409 Conflict, NEVER silently succeed with false claim
  assert.equal(failedSignup.status, 409);
  assert.equal(failedSignup.body.success, false);

  // Ensure rollback: user account was not created
  const storedUser = await userRepository.findByEmail('imposter@test.com');
  assert.equal(storedUser, null);
});

test('14. Guest and user events can both be retrieved for the same resolved journey', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential, guestSession } = guestRes.body.data;

  // 1. Guest records 2 events before signup
  const evtG1 = {
    eventId: `evt_journey_g1_${Date.now()}`,
    type: 'short_link_opened',
    occurredAt: '2026-10-12T09:00:00.000Z',
    canonicalRoute: '/pricing',
    source: 'youtube',
  };
  const evtG2 = {
    eventId: `evt_journey_g2_${Date.now()}`,
    type: 'page_viewed',
    occurredAt: '2026-10-12T09:01:00.000Z',
    canonicalRoute: '/guest-dashboard/cad-practice/2d',
  };

  await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evtG1);
  await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(evtG2);

  // 2. User registers and associates guest session
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Journey Explorer',
      email: 'journey.explorer@test.com',
      password: 'Password123!',
      guestCredential,
    });
  assert.equal(signupRes.status, 201);
  const token = signupRes.body.data.token;

  // 3. User records an event after login
  const evtU1 = {
    eventId: `evt_journey_u1_${Date.now()}`,
    type: 'exercise_submitted',
    occurredAt: '2026-10-12T09:05:00.000Z',
    canonicalRoute: '/user-dashboard/cad-practice/2d',
    exerciseName: 'Gear 2D',
  };

  await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send(evtU1);

  // 4. Query journey using User token
  const journeyRes = await request(app)
    .get('/api/events/journey')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(journeyRes.status, 200);
  assert.equal(journeyRes.body.success, true);
  const retrievedEvents = journeyRes.body.data;

  assert.equal(retrievedEvents.length, 3);
  // Chronological order check: 09:00 -> 09:01 -> 09:05
  assert.equal(retrievedEvents[0].eventId, evtG1.eventId);
  assert.equal(retrievedEvents[0].type, 'short_link_opened');
  assert.equal(retrievedEvents[1].eventId, evtG2.eventId);
  assert.equal(retrievedEvents[1].type, 'page_viewed');
  assert.equal(retrievedEvents[2].eventId, evtU1.eventId);
  assert.equal(retrievedEvents[2].type, 'exercise_submitted');
});

test('15. Repeated association never duplicates or deletes historical events', async () => {
  const guestRes = await request(app).post('/api/guest-sessions').send({});
  const { guestCredential } = guestRes.body.data;

  const testEvt = {
    eventId: `evt_nodup_${Date.now()}`,
    type: 'plan_viewed',
    occurredAt: '2026-10-12T10:00:00.000Z',
    canonicalRoute: '/pricing',
  };

  await request(app)
    .post('/api/events')
    .set('x-guest-session-credential', guestCredential)
    .send(testEvt);

  const initialCount = eventStore.size;

  const user = await userRepository.create({
    name: 'Preserve Tester',
    email: 'preserve@test.com',
    password: 'Password123!',
  });
  const token = generateTestToken(user.id, user.email);

  // Associate 1
  await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential });

  assert.equal(eventStore.size, initialCount);

  // Associate 2 (repeated)
  await request(app)
    .post('/api/guest-sessions/associate')
    .set('Authorization', `Bearer ${token}`)
    .send({ guestCredential });

  // Event count and event content must remain exactly identical
  assert.equal(eventStore.size, initialCount);
  const storedEvent = await eventRepository.findByEventId(testEvt.eventId);
  assert.ok(storedEvent);
  assert.equal(storedEvent.eventId, testEvt.eventId);
  assert.equal(storedEvent.type, 'plan_viewed');
});
