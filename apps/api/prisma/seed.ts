import '../src/env.js';
import { Database } from '../src/db.js';
import { hashPassword } from '../src/password.js';
import { z } from 'zod';

async function seed() {
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  const password = z
    .string()
    .min(14, 'Use an admin password of at least 14 characters.')
    .max(200)
    .parse(process.env.ADMIN_PASSWORD);
  const db = new Database();
  try {
    const existing = await db.admin.findUnique({ where: { email } });
    if (existing) {
      console.log('Admin already exists; password left unchanged.');
      return;
    }
    await db.admin.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    console.log('Admin account created.');
  } finally {
    await db.$disconnect();
  }
}
seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
