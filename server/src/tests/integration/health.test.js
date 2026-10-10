import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../app.js';
import { validateEnv } from '../../config/env.js';

const app = createApp({ nodeEnv: 'test' });
const originalState = mongoose.connection.readyState;
function mockReadyState(state) { Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: state }); }

test.after(() => { mockReadyState(originalState); });
test('health returns 200 when database is ready', async () => {
  mockReadyState(1);
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, message: 'CADIN360 API is running', database: 'connected' });
});
test('health returns 503 when database is unavailable', async () => {
  mockReadyState(0);
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { success: false, message: 'Database unavailable', database: 'unavailable' });
});
test('unknown API routes return consistent 404 JSON', async () => {
  const response = await request(app).get('/api/missing');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { success: false, message: 'Route not found' });
});
test('required environment is validated without exposing credentials', () => {
  assert.throws(() => validateEnv({ PORT: '5000', CLIENT_URL: 'http://localhost:5173' }), /MONGODB_URI/);
  assert.throws(() => validateEnv({ PORT: 'bad', MONGODB_URI: 'mongodb://secret@localhost', CLIENT_URL: 'http://localhost:5173' }), /PORT/);
});
