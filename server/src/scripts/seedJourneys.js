import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { validateEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../modules/auth/user.model.js';
import { GuestSession } from '../modules/guestSession/guestSession.model.js';
import { Event } from '../modules/events/event.model.js';
import { MockPaymentAttempt } from '../modules/payments/mockPaymentAttempt.model.js';
import { USER_ROLES } from '../modules/auth/auth.constants.js';
import { EVENT_TYPES, CANONICAL_ROUTE_LABELS } from '../modules/events/event.constants.js';
import { MOCK_PLANS, PAYMENT_STATUS } from '../modules/payments/mockPayment.constants.js';
import { calculateJourneyStages } from '../modules/events/journey.service.js';

const SOURCES = ['youtube', 'google', 'facebook', 'linkedin', 'twitter', 'reddit', null];
const ROUTES_2D = ['/guest-dashboard/cad-practice/2d', '/user-dashboard/cad-practice/2d'];
const ROUTES_3D = ['/guest-dashboard/cad-practice/3d', '/user-dashboard/cad-practice/3d'];
const ROUTES_OTHER = ['/pricing', '/home', '/docs', '/challenges'];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function seedJourneysDataset({
  targetEvents = 10500,
  targetJourneys = 250,
  reset = false,
} = {}) {
  const config = validateEnv();

  // Safety check: Prevent destructive operations in production
  if (reset && (process.env.NODE_ENV === 'production' || config.nodeEnv === 'production')) {
    throw new Error('CRITICAL SECURITY ERROR: Database reset is forbidden in production environment.');
  }

  await connectDatabase(config.mongodbUri);

  console.log('=====================================================');
  console.log('   CADIN360 Deterministic Journey Seed Generator     ');
  console.log('=====================================================');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Database URI: ${config.mongodbUri}`);
  console.log(`Reset Requested: ${reset}`);

  if (reset) {
    console.warn('\n[CAUTION] Wiping existing events, guest sessions, payment attempts, and demo users...');
    await Event.deleteMany({});
    await MockPaymentAttempt.deleteMany({});
    await GuestSession.deleteMany({});
    await User.deleteMany({ role: USER_ROLES.USER });
    console.log('[OK] Reset complete. Preserving admin accounts.\n');
  }

  // 1. Ensure Admin User exists
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cadin360.com').toLowerCase().trim();
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'AdminPass123!', 10);
    admin = await User.create({
      name: process.env.ADMIN_NAME || 'CADIN360 Admin',
      email: adminEmail,
      passwordHash,
      role: USER_ROLES.ADMIN,
    });
    console.log(`[OK] Admin user created: ${adminEmail}`);
  } else {
    console.log(`[OK] Existing admin verified: ${adminEmail}`);
  }

  // 2. Generate Registered Users (approx 140 users)
  const registeredUserCount = Math.floor(targetJourneys * 0.56); // 140
  const guestOnlyCount = targetJourneys - registeredUserCount; // 110

  console.log(`\nGenerating ${registeredUserCount} registered users and ${guestOnlyCount} guest-only journeys...`);

  const passwordHash = await bcrypt.hash('Password123!', 10);
  const userDocs = [];

  for (let i = 1; i <= registeredUserCount; i++) {
    const email = `visitor_${i}@cadin360.test`;
    userDocs.push({
      name: `Visitor ${i} Engineering`,
      email,
      passwordHash,
      role: USER_ROLES.USER,
    });
  }

  const createdUsers = [];
  for (const u of userDocs) {
    let existing = await User.findOne({ email: u.email });
    if (!existing) {
      existing = await User.create(u);
    }
    createdUsers.push(existing);
  }
  console.log(`[OK] Users ready: ${createdUsers.length} active registered users.`);

  // 3. Generate Guest Sessions
  // For each registered user, generate 1-3 guest sessions (some users have multiple)
  // For guest-only journeys, generate unassociated guest sessions
  const guestSessionDocs = [];

  for (const user of createdUsers) {
    // 30% have 2 or 3 sessions, 60% have 1, 10% have 0 (direct signups)
    const roll = Math.random();
    const sessionCount = roll > 0.7 ? randomBetween(2, 3) : roll > 0.1 ? 1 : 0;
    for (let s = 0; s < sessionCount; s++) {
      const rawCred = crypto.randomBytes(32).toString('hex');
      const credentialHash = crypto.createHash('sha256').update(rawCred).digest('hex');
      guestSessionDocs.push({
        credentialHash,
        associatedUserId: user._id,
        createdAt: new Date(Date.now() - randomBetween(1, 30) * 86400000),
      });
    }
  }

  // Guest-only sessions (unassociated)
  for (let g = 1; g <= guestOnlyCount; g++) {
    const rawCred = crypto.randomBytes(32).toString('hex');
    const credentialHash = crypto.createHash('sha256').update(rawCred).digest('hex');
    guestSessionDocs.push({
      credentialHash,
      associatedUserId: null,
      createdAt: new Date(Date.now() - randomBetween(1, 30) * 86400000),
    });
  }

  const createdGuestSessions = await GuestSession.insertMany(guestSessionDocs);
  console.log(`[OK] Guest sessions created: ${createdGuestSessions.length} total.`);

  // Map users to their associated guest sessions
  const userGuestMap = new Map();
  const unassociatedSessions = [];

  for (const s of createdGuestSessions) {
    if (s.associatedUserId) {
      const uid = s.associatedUserId.toString();
      if (!userGuestMap.has(uid)) userGuestMap.set(uid, []);
      userGuestMap.get(uid).push(s);
    } else {
      unassociatedSessions.push(s);
    }
  }

  // 4. Build Logical Journey List
  const totalJourneysList = [];

  for (const user of createdUsers) {
    totalJourneysList.push({
      type: 'user',
      user,
      sessions: userGuestMap.get(user._id.toString()) || [],
    });
  }
  for (const guest of unassociatedSessions) {
    totalJourneysList.push({
      type: 'guest',
      guestSession: guest,
    });
  }

  console.log(`[OK] Logical journeys mapped: ${totalJourneysList.length} distinct journeys.`);

  // 5. Generate Events across journeys to reach >= 10,000 events
  console.log(`\nGenerating >= ${targetEvents} events across journeys with realistic attribution...`);

  const eventsToInsert = [];
  const paymentAttemptsToInsert = [];
  const eventsPerJourneyAvg = Math.ceil(targetEvents / totalJourneysList.length);
  const baseTime = Date.now() - 28 * 86400000; // 28 days ago

  let eventGlobalSeq = 1;

  for (const journey of totalJourneysList) {
    const eventCount = randomBetween(Math.max(8, eventsPerJourneyAvg - 15), eventsPerJourneyAvg + 20);
    const journeyStartTime = baseTime + randomBetween(0, 22 * 86400000);
    const initialSource = randomChoice(SOURCES);
    const isUser = journey.type === 'user';
    const user = isUser ? journey.user : null;
    const sessions = isUser ? journey.sessions : [journey.guestSession];
    const initialGuestSession = sessions.length > 0 ? sessions[0] : null;

    let currentTime = journeyStartTime;

    // Stage progression probabilities
    const willArrive = Math.random() > 0.15; // 85% arrive via short link
    const willExplore = Math.random() > 0.05; // 95% explore CAD exercises
    const willPay = isUser && Math.random() > 0.45; // ~55% of users pay

    // Event 1: Initial link open if arrived
    if (willArrive && initialSource) {
      eventsToInsert.push({
        eventId: `seed_evt_${eventGlobalSeq++}`,
        type: EVENT_TYPES.SHORT_LINK_OPENED,
        occurredAt: new Date(currentTime),
        receivedAt: new Date(currentTime + randomBetween(50, 500)),
        canonicalRoute: '/pricing',
        originalRoute: `/pricing?src=${initialSource}`,
        canonicalLabel: 'Plans',
        source: initialSource,
        guestSessionId: initialGuestSession ? initialGuestSession._id : null,
        userId: null,
      });
      currentTime += randomBetween(30000, 120000);
    }

    // Events 2..N: Page views & exercises
    for (let e = 0; e < eventCount - 3; e++) {
      const activeSession = sessions.length > 0 ? randomChoice(sessions) : null;
      const isAuthEvent = isUser && Math.random() > 0.35;
      const is2D = Math.random() > 0.45;
      const route = is2D
        ? isAuthEvent ? ROUTES_2D[1] : ROUTES_2D[0]
        : isAuthEvent ? ROUTES_3D[1] : ROUTES_3D[0];
      const canonicalLabel = is2D ? '2D Exercises' : '3D Exercises';

      // Inject equal timestamps occasionally (5%) to test tie-breaker sorting
      const timeOffset = Math.random() < 0.05 ? 0 : randomBetween(15000, 240000);
      currentTime += timeOffset;

      const eventType = Math.random() > 0.45
        ? EVENT_TYPES.PAGE_VIEWED
        : Math.random() > 0.5
        ? EVENT_TYPES.EXERCISE_STARTED
        : EVENT_TYPES.EXERCISE_SUBMITTED;

      eventsToInsert.push({
        eventId: `seed_evt_${eventGlobalSeq++}`,
        type: eventType,
        occurredAt: new Date(currentTime),
        receivedAt: new Date(currentTime + randomBetween(50, 1000)),
        canonicalRoute: route,
        originalRoute: route,
        canonicalLabel,
        exerciseName: is2D ? 'Flange Bracket 2D' : 'Shaft Assembly 3D',
        source: null,
        guestSessionId: activeSession ? activeSession._id : null,
        userId: isAuthEvent ? user._id : null,
      });
    }

    // Signup event if signed up
    if (isUser) {
      currentTime += randomBetween(45000, 180000);
      eventsToInsert.push({
        eventId: `seed_evt_${eventGlobalSeq++}`,
        type: EVENT_TYPES.SIGNUP_COMPLETED,
        occurredAt: new Date(currentTime),
        receivedAt: new Date(currentTime + 100),
        canonicalRoute: '/register',
        originalRoute: '/register',
        guestSessionId: initialGuestSession ? initialGuestSession._id : null,
        userId: user._id,
      });
    }

    // Mock Payment attempts
    if (isUser) {
      if (willPay) {
        // Successful verified mock payment
        currentTime += randomBetween(60000, 300000);
        const planKey = randomChoice(['basic', 'starter', 'pro', 'enterprise']);
        const plan = MOCK_PLANS[planKey];
        const payAttemptId = `pay_att_seed_${user._id.toString().slice(-6)}_${randomBetween(1000, 9999)}`;

        paymentAttemptsToInsert.push({
          paymentAttemptId: payAttemptId,
          journeyIdentity: `user_${user._id}`,
          userId: user._id,
          guestSessionId: initialGuestSession ? initialGuestSession._id : null,
          planId: planKey,
          planName: plan.name,
          amount: plan.amount,
          currency: 'USD',
          status: PAYMENT_STATUS.SUCCEEDED,
          verificationReference: `mock_verif_${crypto.randomUUID()}`,
          verifiedAt: new Date(currentTime),
          eventId: `pay_evt_${payAttemptId}`,
          createdAt: new Date(currentTime - 15000),
          updatedAt: new Date(currentTime),
        });

        eventsToInsert.push({
          eventId: `pay_evt_${payAttemptId}`,
          type: EVENT_TYPES.PAYMENT_COMPLETED,
          occurredAt: new Date(currentTime),
          receivedAt: new Date(currentTime + 50),
          canonicalRoute: '/plans',
          originalRoute: '/plans',
          canonicalLabel: 'Plans',
          userId: user._id,
          guestSessionId: initialGuestSession ? initialGuestSession._id : null,
          paymentVerification: {
            paymentId: payAttemptId,
            amount: plan.amount,
            currency: 'USD',
            verifiedAt: new Date(currentTime),
            status: 'verified',
          },
          metadata: {
            paymentAttemptId: payAttemptId,
            verified: true,
            plan: planKey,
            amount: plan.amount,
            currency: 'USD',
          },
        });
      } else if (Math.random() < 0.2) {
        // Failed mock payment
        currentTime += randomBetween(30000, 180000);
        const failAttemptId = `pay_att_fail_${user._id.toString().slice(-6)}_${randomBetween(1000, 9999)}`;
        paymentAttemptsToInsert.push({
          paymentAttemptId: failAttemptId,
          journeyIdentity: `user_${user._id}`,
          userId: user._id,
          guestSessionId: initialGuestSession ? initialGuestSession._id : null,
          planId: 'starter',
          planName: MOCK_PLANS.starter.name,
          amount: MOCK_PLANS.starter.amount,
          currency: 'USD',
          status: PAYMENT_STATUS.FAILED,
          verificationReference: `mock_verif_${crypto.randomUUID()}`,
          failureReason: 'Card declined by mock simulator',
          verifiedAt: null,
          eventId: null,
          createdAt: new Date(currentTime - 20000),
          updatedAt: new Date(currentTime),
        });
      } else if (Math.random() < 0.15) {
        // Pending mock payment
        const pendAttemptId = `pay_att_pend_${user._id.toString().slice(-6)}_${randomBetween(1000, 9999)}`;
        paymentAttemptsToInsert.push({
          paymentAttemptId: pendAttemptId,
          journeyIdentity: `user_${user._id}`,
          userId: user._id,
          guestSessionId: initialGuestSession ? initialGuestSession._id : null,
          planId: 'basic',
          planName: MOCK_PLANS.basic.name,
          amount: MOCK_PLANS.basic.amount,
          currency: 'USD',
          status: PAYMENT_STATUS.PENDING,
          verificationReference: `mock_verif_${crypto.randomUUID()}`,
          verifiedAt: null,
          eventId: null,
          createdAt: new Date(currentTime),
          updatedAt: new Date(currentTime),
        });
      }
    }
  }

  console.log(`[OK] Prepared ${eventsToInsert.length} events and ${paymentAttemptsToInsert.length} mock payment attempts.`);

  // Batch insert in chunks of 1000
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < eventsToInsert.length; i += CHUNK_SIZE) {
    const chunk = eventsToInsert.slice(i, i + CHUNK_SIZE);
    await Event.insertMany(chunk, { ordered: false });
    console.log(`Inserted events ${i + 1} to ${Math.min(i + CHUNK_SIZE, eventsToInsert.length)}`);
  }

  if (paymentAttemptsToInsert.length > 0) {
    await MockPaymentAttempt.insertMany(paymentAttemptsToInsert, { ordered: false });
    console.log(`Inserted ${paymentAttemptsToInsert.length} mock payment attempts into database.`);
  }

  // 6. Calculate Actual Database State Metrics
  console.log('\n=====================================================');
  console.log('   POST-SEED DATABASE VERIFICATION REPORT            ');
  console.log('=====================================================');

  const totalEventsInDb = await Event.countDocuments();
  const totalUsersInDb = await User.countDocuments();
  const registeredUsersInDb = await User.countDocuments({ role: USER_ROLES.USER });
  const totalGuestSessionsInDb = await GuestSession.countDocuments();
  const associatedGuestSessionsInDb = await GuestSession.countDocuments({ associatedUserId: { $ne: null } });
  const unassociatedGuestSessionsInDb = await GuestSession.countDocuments({ associatedUserId: null });
  const totalLogicalJourneysInDb = registeredUsersInDb + unassociatedGuestSessionsInDb;
  const paymentAttemptsInDb = await MockPaymentAttempt.countDocuments();

  // Stage calculation across all journeys directly from DB events
  let arrivedCount = 0;
  let exploredCount = 0;
  let signedUpCount = 0;
  let paidCount = 0;

  // Query events per user journey
  const allUsers = await User.find({ role: USER_ROLES.USER }).select('_id');
  for (const u of allUsers) {
    const sessions = await GuestSession.find({ associatedUserId: u._id }).select('_id');
    const sessionIds = sessions.map((s) => s._id);
    const events = await Event.find({
      $or: [{ userId: u._id }, { guestSessionId: { $in: sessionIds } }],
    }).lean();

    const stages = calculateJourneyStages(events);
    if (stages.arrived) arrivedCount++;
    if (stages.explored) exploredCount++;
    if (stages.signedUp) signedUpCount++;
    if (stages.paid) paidCount++;
  }

  // Query events per guest-only journey
  const unassociated = await GuestSession.find({ associatedUserId: null }).select('_id');
  for (const g of unassociated) {
    const events = await Event.find({ guestSessionId: g._id }).lean();
    const stages = calculateJourneyStages(events);
    if (stages.arrived) arrivedCount++;
    if (stages.explored) exploredCount++;
    if (stages.signedUp) signedUpCount++;
    if (stages.paid) paidCount++;
  }

  const report = {
    totalEventsInserted: totalEventsInDb,
    totalRegisteredUsers: registeredUsersInDb,
    totalGuestSessions: totalGuestSessionsInDb,
    totalLogicalJourneys: totalLogicalJourneysInDb,
    associatedGuestSessions: associatedGuestSessionsInDb,
    unassociatedGuestSessions: unassociatedGuestSessionsInDb,
    mockPaymentAttempts: paymentAttemptsInDb,
    journeysByStage: {
      arrived: arrivedCount,
      explored: exploredCount,
      signedUp: signedUpCount,
      paid: paidCount,
    },
  };

  console.table({
    'Total Events in DB': report.totalEventsInserted,
    'Total Registered Users': report.totalRegisteredUsers,
    'Total Guest Sessions': report.totalGuestSessions,
    'Associated Guest Sessions': report.associatedGuestSessions,
    'Unassociated Guest Sessions': report.unassociatedGuestSessions,
    'Total Logical Journeys': report.totalLogicalJourneys,
    'Mock Payment Attempts': report.mockPaymentAttempts,
    'Stage: Arrived': report.journeysByStage.arrived,
    'Stage: Explored': report.journeysByStage.explored,
    'Stage: Signed Up': report.journeysByStage.signedUp,
    'Stage: Paid': report.journeysByStage.paid,
  });

  console.log('=====================================================\n');

  await disconnectDatabase();
  return report;
}

// Execute when run directly
if (process.argv[1] && process.argv[1].endsWith('seedJourneys.js')) {
  const shouldReset = process.argv.includes('--reset');
  seedJourneysDataset({ reset: shouldReset })
    .then(() => {
      console.log('Seed executed successfully.');
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed execution error:', err);
      try {
        await disconnectDatabase();
      } catch (_e) {}
      process.exit(1);
    });
}
