import bcrypt from 'bcryptjs';
import { validateEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../modules/auth/user.model.js';
import { USER_ROLES } from '../modules/auth/auth.constants.js';

async function seedAdmin() {
  const config = validateEnv();
  await connectDatabase(config.mongodbUri);

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cadin360.com').toLowerCase().trim();
  const adminName = process.env.ADMIN_NAME || 'CADIN360 Admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';

  console.log(`Checking existing admin user for: ${adminEmail}`);

  let user = await User.findOne({ email: adminEmail });
  if (user) {
    if (user.role !== USER_ROLES.ADMIN) {
      user.role = USER_ROLES.ADMIN;
      await user.save();
      console.log(`Updated user ${adminEmail} to admin role.`);
    } else {
      console.log(`Admin user ${adminEmail} already exists.`);
    }
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await User.create({
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: USER_ROLES.ADMIN,
    });
    console.log(`Admin user successfully seeded: ${adminEmail}`);
  }

  await disconnectDatabase();
  console.log('Database disconnected.');
}

seedAdmin().catch(async (err) => {
  console.error('Seeding admin failed:', err.message);
  try {
    await disconnectDatabase();
  } catch (_e) {
    // Ignore cleanup error
  }
  process.exit(1);
});
