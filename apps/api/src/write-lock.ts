import type { Prisma } from './generated/prisma/client.js';

// Transaction-local settings work with Neon transaction pooling. Startup/session
// settings are not reliable there. The server must release locks even if the
// client loses its connection before Prisma can send ROLLBACK.
export async function acquireWriteLock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT set_config('statement_timeout', '12000', true), set_config('idle_in_transaction_session_timeout', '30000', true)`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(70120261029::bigint)::text`;
}
