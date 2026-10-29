import { afterAll, expect, it } from 'vitest';
import { Database } from '../src/db.js';
import { acquireWriteLock } from '../src/write-lock.js';

if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw Error('Isolated DATABASE_URL=TEST_DATABASE_URL required.');
const db = new Database();
afterAll(() => db.$disconnect());

it('expires an abandoned write transaction on the server and allows the next writer', async () => {
  let settings: { statement: string; idle: string }[] = [];
  const started = Date.now();
  await expect(
    db.$transaction(
      async (tx) => {
        await acquireWriteLock(tx);
        settings = await tx.$queryRaw<
          { statement: string; idle: string }[]
        >`SELECT current_setting('statement_timeout') AS statement, current_setting('idle_in_transaction_session_timeout') AS idle`;
        // No SQL while the client is stalled: PostgreSQL must release this session.
        await new Promise((resolve) => setTimeout(resolve, 31000));
        await tx.$queryRaw`SELECT 1`;
      },
      { timeout: 40000 },
    ),
  ).rejects.toThrow();
  expect(settings[0]).toEqual({ statement: '12s', idle: '30s' });
  expect(Date.now() - started).toBeGreaterThanOrEqual(30000);
  await db.$transaction(async (tx) => {
    await acquireWriteLock(tx);
    const result = await tx.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0].ok).toBe(1);
  });
}, 45000);
