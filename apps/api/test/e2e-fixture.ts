import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { hashPassword } from '../src/password.js';

export async function adminFixture() {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  )
    throw Error(
      'E2E requires DATABASE_URL=TEST_DATABASE_URL on an isolated test database.',
    );
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const marker = `e2e-${randomUUID().slice(0, 8)}`;
  const email = `${marker}@example.test`;
  const password = randomUUID();
  await pool.query(
    'INSERT INTO "Admin" (id,email,"passwordHash") VALUES ($1,$2,$3)',
    [randomUUID(), email, await hashPassword(password)],
  );
  return {
    marker,
    email,
    password,
    async expire() {
      await pool.query(
        'UPDATE "Session" SET "expiresAt"=NOW()-interval \'1 second\' WHERE "adminId" IN (SELECT id FROM "Admin" WHERE email=$1)',
        [email],
      );
    },
    async cleanup() {
      // Fixtures own these documents and all their movement/balance rows.
      await pool.query(
        'DELETE FROM "StockMovement" WHERE "actorId" IN (SELECT id FROM "Admin" WHERE email=$1)',
        [email],
      );
      await pool.query(
        'DELETE FROM "InventoryCountItem" WHERE "countId" IN (SELECT id FROM "InventoryCount" WHERE "createdById" IN (SELECT id FROM "Admin" WHERE email=$1))',
        [email],
      );
      await pool.query(
        'DELETE FROM "InventoryCount" WHERE "createdById" IN (SELECT id FROM "Admin" WHERE email=$1)',
        [email],
      );
      await pool.query(
        'DELETE FROM "Supply" WHERE "createdById" IN (SELECT id FROM "Admin" WHERE email=$1)',
        [email],
      );
      await pool.query(
        'DELETE FROM "StockBalance" WHERE "warehouseId" IN (SELECT id FROM "Warehouse" WHERE name LIKE $1)',
        [`%${marker}%`],
      );
      await pool.query(
        'DELETE FROM "Image" WHERE "productId" IN (SELECT id FROM "Product" WHERE name LIKE $1)',
        [`%${marker}%`],
      );
      await pool.query(
        'DELETE FROM "Variant" WHERE "productId" IN (SELECT id FROM "Product" WHERE name LIKE $1)',
        [`%${marker}%`],
      );
      await pool.query('DELETE FROM "Product" WHERE name LIKE $1', [
        `%${marker}%`,
      ]);
      await pool.query(
        'DELETE FROM "Tag" WHERE name LIKE $1 AND NOT EXISTS (SELECT 1 FROM "ProductTag" WHERE "tagId"="Tag".id)',
        [`%${marker}%`],
      );
      await pool.query('DELETE FROM "Admin" WHERE email=$1', [email]);
      await pool.query('DELETE FROM "LoginThrottle" WHERE key=$1', [
        `email:${createHash('sha256').update(email).digest('hex')}`,
      ]);
      await pool.query(
        'DELETE FROM "AttributeValue" WHERE "attributeId" IN (SELECT id FROM "Attribute" WHERE name LIKE $1)',
        [`%${marker}%`],
      );
      for (const table of ['Attribute', 'Unit', 'Warehouse', 'Supplier'])
        await pool.query(`DELETE FROM "${table}" WHERE name LIKE $1`, [
          `%${marker}%`,
        ]);
      await pool.query(
        'UPDATE "Category" SET "parentId"=NULL WHERE name LIKE $1',
        [`%${marker}%`],
      );
      await pool.query('DELETE FROM "Category" WHERE name LIKE $1', [
        `%${marker}%`,
      ]);
      await pool.end();
    },
  };
}
