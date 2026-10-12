import { validateEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../modules/auth/user.model.js';
import { USER_ROLES } from '../modules/auth/auth.constants.js';

async function promoteAdmin() {
  const emailArg = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@cadin360.com';
  const targetEmail = emailArg.toLowerCase().trim();

  const config = validateEnv();
  await connectDatabase(config.mongodbUri);

  const user = await User.findOne({ email: targetEmail });
  if (!user) {
    console.error(`User with email "${targetEmail}" was not found.`);
    await disconnectDatabase();
    process.exit(1);
  }

  user.role = USER_ROLES.ADMIN;
  await user.save();
  console.log(`Successfully promoted "${targetEmail}" to role: "${USER_ROLES.ADMIN}".`);

  await disconnectDatabase();
}

promoteAdmin().catch(async (err) => {
  console.error('Error promoting admin:', err.message);
  try {
    await disconnectDatabase();
  } catch (_e) {}
  process.exit(1);
});
