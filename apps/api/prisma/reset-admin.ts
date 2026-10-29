import '../src/env.js';
import { Database } from '../src/db.js';
import { hashPassword } from '../src/password.js';
import { z } from 'zod';

async function reset() {
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  const password = z
    .string()
    .min(14)
    .max(200)
    .parse(process.env.ADMIN_PASSWORD);
  const db = new Database();
  try {
    const admin = await db.admin.findUnique({ where: { email } });
    if (!admin) throw new Error('Admin not found.');
    const passwordHash = await hashPassword(password);
    await db.$transaction([
      db.admin.update({ where: { id: admin.id }, data: { passwordHash } }),
      db.session.deleteMany({ where: { adminId: admin.id } }),
    ]);
    console.log('Admin password reset; all sessions revoked.');
  } finally {
    await db.$disconnect();
  }
}
reset().catch(() => {
  console.error(
    'Admin reset failed. Verify the email, password policy and database connection.',
  );
  process.exitCode = 1;
});
