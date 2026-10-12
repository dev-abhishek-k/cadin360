import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { createApp } from '../../app.js';
import { userRepository } from '../../modules/auth/user.repository.js';
import { guestSessionRepository } from '../../modules/guestSession/guestSession.repository.js';
import { authService } from '../../modules/auth/auth.service.js';
import { guestSessionService } from '../../modules/guestSession/guestSession.service.js';

const app = createApp({ nodeEnv: 'test' });

// In-memory test stores
const userStore = new Map();
const guestStore = new Map();

userRepository.create = async (userData) => {
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    _id: id,
    id,
    name: userData.name,
    email: userData.email.toLowerCase().trim(),
    passwordHash: userData.passwordHash || userData.password,
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
  if (!session) return null;
  return { ...session };
};

guestSessionRepository.findById = async (id) => {
  for (const session of guestStore.values()) {
    if (session.id === id || session._id === id) {
      return { ...session };
    }
  }
  return null;
};

guestSessionRepository.claimSessionAtomically = async (credentialHash, userId) => {
  const session = guestStore.get(credentialHash);
  if (!session) return null;
  if (session.associatedUserId !== null) return null;
  session.associatedUserId = userId;
  session.updatedAt = new Date();
  guestStore.set(credentialHash, session);
  return { ...session };
};

test.beforeEach(() => {
  userStore.clear();
  guestStore.clear();
});

// 1. Guest session creation
test('1. Guest session creation returns raw unguessable credential and stores only SHA-256 hash', async () => {
  const response = await request(app).post('/api/guest-sessions');

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.ok(response.body.guestCredential, 'Raw credential must be returned upon creation');
  assert.equal(typeof response.body.guestCredential, 'string');
  assert.equal(response.body.guestCredential.length, 64, 'Must be 64-char hex string from 32 cryptographically secure bytes');
  assert.equal(response.body.guestSession.associatedUserId, null);
  assert.equal(response.body.credentialHash, undefined, 'Hash must never be exposed');

  // Verify hash was saved in store
  const expectedHash = crypto.createHash('sha256').update(response.body.guestCredential).digest('hex');
  const stored = guestStore.get(expectedHash);
  assert.ok(stored, 'Session must be stored using its credential hash');
  assert.equal(stored.credentialHash, expectedHash);
});

// 2. Successful signup and password hashing
test('2. Successful signup normalizes email, hashes password with bcrypt, and issues token', async () => {
  const response = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Alice Smith', email: '  Alice@Example.Com  ', password: 'password123' });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.email, 'alice@example.com', 'Email must be normalized');
  assert.equal(response.body.user.name, 'Alice Smith');
  assert.equal(response.body.user.role, 'user');
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.user.passwordHash, undefined);
  assert.ok(response.body.token);

  // Verify DB record
  const stored = userStore.get('alice@example.com');
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, 'password123');
  const isMatch = await bcrypt.compare('password123', stored.passwordHash);
  assert.equal(isMatch, true, 'Stored password must be a valid bcrypt hash');
});

// 3. Duplicate email rejection
test('3. Duplicate email rejection returns 409 Conflict', async () => {
  await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Bob First', email: 'bob@example.com', password: 'password123' });

  const duplicateRes = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Bob Second', email: 'BOB@example.com', password: 'password999' });

  assert.equal(duplicateRes.status, 409);
  assert.equal(duplicateRes.body.success, false);
});

// 4. Successful and unsuccessful login
test('4. Successful and unsuccessful login with generic non-disclosing error messages', async () => {
  const passwordHash = await bcrypt.hash('secretpass', 10);
  userStore.set('charlie@example.com', {
    _id: 'charlie-id',
    id: 'charlie-id',
    name: 'Charlie',
    email: 'charlie@example.com',
    passwordHash,
    role: 'user',
    createdAt: new Date(),
  });

  // Successful login
  const okRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'Charlie@Example.com', password: 'secretpass' });

  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.success, true);
  assert.equal(okRes.body.user.email, 'charlie@example.com');
  assert.ok(okRes.body.token);

  // Wrong password
  const badPassRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'charlie@example.com', password: 'wrongpassword' });

  assert.equal(badPassRes.status, 401);
  assert.equal(badPassRes.body.message, 'Invalid email or password');

  // Unknown email (must return same generic error)
  const unknownEmailRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nonexistent@example.com', password: 'secretpass' });

  assert.equal(unknownEmailRes.status, 401);
  assert.equal(unknownEmailRes.body.message, 'Invalid email or password');
});

// 5. Access to /api/auth/me with and without authentication
test('5. Access to /api/auth/me requires authentication and returns safe profile', async () => {
  userStore.set('dave@example.com', {
    _id: 'dave-id',
    id: 'dave-id',
    name: 'Dave',
    email: 'dave@example.com',
    role: 'user',
    createdAt: new Date(),
  });

  // Unauthenticated request
  const unauthRes = await request(app).get('/api/auth/me');
  assert.equal(unauthRes.status, 401);

  // Authenticated request via Cookie
  const token = authService.generateToken({ id: 'dave-id', email: 'dave@example.com', role: 'user' });
  const authRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', [`token=${token}`]);

  assert.equal(authRes.status, 200);
  assert.equal(authRes.body.success, true);
  assert.equal(authRes.body.user.name, 'Dave');
  assert.equal(authRes.body.user.passwordHash, undefined);
});

// 6. Public signup cannot create an admin
test('6. Public signup cannot create an admin (forces user role)', async () => {
  const response = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Malicious User',
      email: 'hacker@example.com',
      password: 'password123',
      role: 'admin', // Attempt privilege escalation without secret
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, 'user', 'Public signup must force user role');

  const stored = userStore.get('hacker@example.com');
  assert.equal(stored.role, 'user');
});

// 6b. Authorized signup with admin secret key creates admin
test('6b. Authorized admin signup with admin secret creates admin user', async () => {
  const response = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Legit Operator',
      email: 'operator@example.com',
      password: 'password123',
      role: 'admin',
      adminSecret: 'admin123',
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, 'admin', 'Authorized signup must grant admin role');

  const stored = userStore.get('operator@example.com');
  assert.equal(stored.role, 'admin');
});

// 7. Guest history association during signup
test('7. Guest history association during signup attaches guest session to user', async () => {
  // 1. Create a guest session
  const guestRes = await request(app).post('/api/guest-sessions');
  const rawCredential = guestRes.body.guestCredential;

  // 2. Register user with guest credential
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Guest Convert',
      email: 'convert@example.com',
      password: 'password123',
      guestCredential: rawCredential,
    });

  assert.equal(signupRes.status, 201);
  const userId = signupRes.body.user.id;

  // 3. Verify in guest store
  const expectedHash = crypto.createHash('sha256').update(rawCredential).digest('hex');
  const updatedGuest = guestStore.get(expectedHash);
  assert.ok(updatedGuest);
  assert.equal(updatedGuest.associatedUserId, userId, 'Guest session must be associated with the new user');
});

// 8. Repeated association with the same user is safe (idempotent)
test('8. Repeated association of a guest session with the same user is safe and idempotent', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const rawCredential = guestRes.body.guestCredential;

  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Idempotent User',
      email: 'idem@example.com',
      password: 'password123',
      guestCredential: rawCredential,
    });

  const userId = signupRes.body.user.id;

  // Associate again via service for the same user
  const secondAttempt = await guestSessionService.associateSession(
    rawCredential,
    userId,
    guestSessionRepository
  );

  assert.equal(secondAttempt.alreadyAssociated, true);
});

// 9. A second user cannot claim an already-owned guest session
test('9. A second user cannot claim an already-owned guest session', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  const rawCredential = guestRes.body.guestCredential;

  // User 1 claims it
  await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Owner User',
      email: 'owner@example.com',
      password: 'password123',
      guestCredential: rawCredential,
    });

  // User 2 attempts to claim it during signup
  const user2Res = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Thief User',
      email: 'thief@example.com',
      password: 'password123',
      guestCredential: rawCredential,
    });

  assert.equal(user2Res.status, 409);
  assert.equal(user2Res.body.success, false);
  assert.ok(user2Res.body.message.includes('already claimed'));
});

// 10. Password hashes and guest credential hashes are never exposed in responses
test('10. Password hashes and guest credential hashes are never exposed in responses', async () => {
  const guestRes = await request(app).post('/api/guest-sessions');
  assert.equal(guestRes.body.credentialHash, undefined);
  assert.equal(guestRes.body.guestSession?.credentialHash, undefined);

  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      name: 'Privacy User',
      email: 'privacy@example.com',
      password: 'password123',
      guestCredential: guestRes.body.guestCredential,
    });

  assert.equal(signupRes.body.password, undefined);
  assert.equal(signupRes.body.passwordHash, undefined);
  assert.equal(signupRes.body.user?.password, undefined);
  assert.equal(signupRes.body.user?.passwordHash, undefined);
  assert.equal(signupRes.body.guestSession?.credentialHash, undefined);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'privacy@example.com', password: 'password123' });

  assert.equal(loginRes.body.password, undefined);
  assert.equal(loginRes.body.passwordHash, undefined);
  assert.equal(loginRes.body.user?.password, undefined);
  assert.equal(loginRes.body.user?.passwordHash, undefined);

  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', [`token=${loginRes.body.token}`]);

  assert.equal(meRes.body.password, undefined);
  assert.equal(meRes.body.passwordHash, undefined);
  assert.equal(meRes.body.user?.password, undefined);
  assert.equal(meRes.body.user?.passwordHash, undefined);
});
