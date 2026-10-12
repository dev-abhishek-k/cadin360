import { validateEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../modules/auth/user.model.js';
import { GuestSession } from '../modules/guestSession/guestSession.model.js';
import { Event } from '../modules/events/event.model.js';
import { MockPaymentAttempt } from '../modules/payments/mockPaymentAttempt.model.js';
import { USER_ROLES } from '../modules/auth/auth.constants.js';

function extractIndexName(plan) {
  if (!plan) return 'COLLSCAN (No index)';
  if (plan.indexName) return plan.indexName;
  if (plan.inputStage) return extractIndexName(plan.inputStage);
  if (Array.isArray(plan.inputStages)) {
    for (const sub of plan.inputStages) {
      const found = extractIndexName(sub);
      if (found !== 'COLLSCAN (No index)') return found;
    }
  }
  return plan.stage === 'COLLSCAN' ? 'COLLSCAN (No index)' : plan.stage || 'COLLSCAN (No index)';
}

export async function runQueryExplain() {
  const config = validateEnv();
  await connectDatabase(config.mongodbUri);

  console.log('=====================================================');
  console.log('   CADIN360 MongoDB Query Plan & Index Inspection    ');
  console.log('=====================================================\n');

  const totalEvents = await Event.countDocuments();
  console.log(`Target Dataset Size: ${totalEvents} events in collection.\n`);

  // Find a sample user and sample guest session
  const sampleUser = await User.findOne({ role: USER_ROLES.USER });
  const sampleGuest = await GuestSession.findOne({ associatedUserId: null });
  const samplePayment = await MockPaymentAttempt.findOne();

  if (!sampleUser || !sampleGuest) {
    console.warn('Please run seed script first to populate sample data.');
    await disconnectDatabase();
    return;
  }

  const results = [];

  // Query 1: User Timeline Chronological Fetch
  {
    console.log('--- Inspecting Query 1: User Journey Timeline ---');
    const query = Event.find({ userId: sampleUser._id })
      .sort({ occurredAt: 1, eventId: 1 })
      .select('eventId type occurredAt canonicalRoute');

    const explain = await query.explain('executionStats');
    const stats = explain.executionStats;
    const usedIndex = extractIndexName(explain.queryPlanner.winningPlan);

    const result = {
      query: '1. User Timeline Query: { userId: ObjectId } SORT { occurredAt: 1, eventId: 1 }',
      purpose: 'Retrieve chronologically ordered events for a registered user journey',
      indexUsed: usedIndex,
      isIndexUsed: !usedIndex.includes('COLLSCAN'),
      docsExamined: stats.totalDocsExamined,
      docsReturned: stats.nReturned,
      executionTimeMs: stats.executionTimeMillis,
    };
    results.push(result);
    console.log(result);
    console.log('');
  }

  // Query 2: Guest Session Timeline Fetch
  {
    console.log('--- Inspecting Query 2: Guest Journey Timeline ---');
    const query = Event.find({ guestSessionId: sampleGuest._id })
      .sort({ occurredAt: 1, eventId: 1 })
      .select('eventId type occurredAt canonicalRoute');

    const explain = await query.explain('executionStats');
    const stats = explain.executionStats;
    const usedIndex = extractIndexName(explain.queryPlanner.winningPlan);

    const result = {
      query: '2. Guest Timeline Query: { guestSessionId: ObjectId } SORT { occurredAt: 1, eventId: 1 }',
      purpose: 'Retrieve chronologically ordered events for an unassociated guest session',
      indexUsed: usedIndex,
      isIndexUsed: !usedIndex.includes('COLLSCAN'),
      docsExamined: stats.totalDocsExamined,
      docsReturned: stats.nReturned,
      executionTimeMs: stats.executionTimeMillis,
    };
    results.push(result);
    console.log(result);
    console.log('');
  }

  // Query 3: Date Range Filter with Deterministic Sort
  {
    console.log('--- Inspecting Query 3: Dashboard Date Range & Sort ---');
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const query = Event.find({
      occurredAt: { $gte: sevenDaysAgo, $lte: new Date() },
    })
      .sort({ occurredAt: 1, eventId: 1 })
      .limit(50);

    const explain = await query.explain('executionStats');
    const stats = explain.executionStats;
    const usedIndex = extractIndexName(explain.queryPlanner.winningPlan);

    const result = {
      query: '3. Date Range Query: { occurredAt: { $gte, $lte } } SORT { occurredAt: 1, eventId: 1 } LIMIT 50',
      purpose: 'Dashboard date-filtered journey qualification and event pagination',
      indexUsed: usedIndex,
      isIndexUsed: !usedIndex.includes('COLLSCAN'),
      docsExamined: stats.totalDocsExamined,
      docsReturned: stats.nReturned,
      executionTimeMs: stats.executionTimeMillis,
    };
    results.push(result);
    console.log(result);
    console.log('');
  }

  // Query 4: Payment Attempt Lookup
  if (samplePayment) {
    console.log('--- Inspecting Query 4: Mock Payment Lookup ---');
    const query = MockPaymentAttempt.findOne({ paymentAttemptId: samplePayment.paymentAttemptId });

    const explain = await query.explain('executionStats');
    const stats = explain.executionStats;
    const usedIndex = extractIndexName(explain.queryPlanner.winningPlan);

    const result = {
      query: '4. Mock Payment Attempt: { paymentAttemptId: String }',
      purpose: 'Fast lookup and atomic status verification for checkout attempts',
      indexUsed: usedIndex,
      isIndexUsed: !usedIndex.includes('COLLSCAN'),
      docsExamined: stats.totalDocsExamined,
      docsReturned: stats.nReturned,
      executionTimeMs: stats.executionTimeMillis,
    };
    results.push(result);
    console.log(result);
    console.log('');
  }

  console.log('=====================================================');
  console.log('   QUERY PLAN SUMMARY TABLE                          ');
  console.log('=====================================================');
  console.table(
    results.map((r) => ({
      Query: r.query.slice(0, 45) + '...',
      'Index Used': r.indexUsed,
      'Docs Examined': r.docsExamined,
      'Docs Returned': r.docsReturned,
      'Time (ms)': r.executionTimeMs,
    }))
  );
  console.log('=====================================================\n');

  await disconnectDatabase();
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('explainQueryPlan.js')) {
  runQueryExplain()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('Explain plan error:', err);
      try {
        await disconnectDatabase();
      } catch (_e) {}
      process.exit(1);
    });
}
