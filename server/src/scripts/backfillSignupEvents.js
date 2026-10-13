import { validateEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../modules/auth/user.model.js';
import { Event } from '../modules/events/event.model.js';
import mongoose from 'mongoose';

async function backfillSignupEvents() {
  await connectDatabase(validateEnv().mongodbUri);
  try {
    let created = 0;
    const userIdArg = process.argv.indexOf('--user-id');
    const userId = userIdArg >= 0 ? process.argv[userIdArg + 1] : null;
    if (userIdArg >= 0 && !mongoose.isValidObjectId(userId)) {
      throw new Error('--user-id requires a valid user ID');
    }
    const users = await User.find(userId ? { _id: userId } : { role: 'user' }, { _id: 1, createdAt: 1 }).lean();
    for (const user of users) {
      if (await Event.exists({ userId: user._id, type: 'signup_completed' })) continue;
      const result = await Event.updateOne(
        { eventId: `signup_${user._id}` },
        { $setOnInsert: {
          eventId: `signup_${user._id}`,
          type: 'signup_completed',
          occurredAt: user.createdAt,
          receivedAt: new Date(),
          canonicalRoute: '/register',
          originalRoute: '/register',
          userId: user._id,
        } },
        { upsert: true }
      );
      created += result.upsertedCount;
    }
    console.log(`Signup milestones added: ${created}; accounts checked: ${users.length}`);
  } finally {
    await disconnectDatabase();
  }
}

backfillSignupEvents().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
