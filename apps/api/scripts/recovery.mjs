import { openSync, closeSync, chmodSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

export class RecoveryError extends Error {}

// Dedicated variables only: never silently inherit the application's database.
export function connection(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RecoveryError('A database URL is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2
  )
    throw new RecoveryError('Use a complete PostgreSQL connection URL.');
  if (url.hostname.includes('-pooler.'))
    throw new RecoveryError('Use an unpooled connection.');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_-]+$/.test(database))
    throw new RecoveryError('Unsupported database name.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const options = {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: local ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
  };
  return {
    options,
    env: {
      PATH: process.env.PATH,
      PGHOST: options.host,
      PGPORT: String(options.port),
      PGUSER: options.user,
      PGPASSWORD: options.password,
      PGDATABASE: database,
      PGSSLMODE: local ? 'disable' : 'verify-full',
      ...(local ? {} : { PGSSLROOTCERT: 'system' }),
      PGCONNECT_TIMEOUT: '10',
    },
  };
}
export async function recover(mode, file, env = process.env) {
  if (!['backup', 'restore'].includes(mode) || !file)
    throw new RecoveryError(
      'Usage: db:backup|db:restore <absolute archive path>',
    );
  if (!file.startsWith('/'))
    throw new RecoveryError('Use an absolute archive path.');
  const target = connection(
    env[mode === 'backup' ? 'BACKUP_DATABASE_URL' : 'RESTORE_DATABASE_URL'],
  );
  if (mode === 'backup') {
    // Exclusive creation prevents accidental replacement and restricts access from the start.
    const fd = openSync(file, 'wx', 0o600);
    closeSync(fd);
    run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--exclude-table-data=public."Session"',
        '--exclude-table-data=public."LoginThrottle"',
        '--file',
        file,
      ],
      target.env,
    );
    chmodSync(file, 0o600);
    console.log('Backup complete. Session and login-throttle rows excluded.');
  } else {
    if (env.RESTORE_CONFIRM_DATABASE !== target.options.database)
      throw new RecoveryError(
        'RESTORE_CONFIRM_DATABASE must match the target database name.',
      );
    if (env.BACKUP_DATABASE_URL) {
      const source = connection(env.BACKUP_DATABASE_URL).options;
      if (
        source.host === target.options.host &&
        source.port === target.options.port &&
        source.database === target.options.database
      )
        throw new RecoveryError('Source and restore target must differ.');
    }
    if (!statSync(file).isFile())
      throw new RecoveryError('Archive must be a file.');
    const client = new pg.Client(target.options);
    try {
      await client.connect();
      const result = await client.query(
        "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1",
      );
      if (result.rowCount)
        throw new RecoveryError('Restore requires an empty database.');
    } finally {
      await client.end();
    }
    run(
      'pg_restore',
      [
        '--dbname',
        target.options.database,
        '--single-transaction',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        file,
      ],
      target.env,
    );
    console.log(
      'Restore complete. Verify readiness, ledger totals and administrator login before switching traffic.',
    );
  }
}
function run(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    timeout: 300000,
  });
  // PostgreSQL diagnostics may contain business data. Do not print them in CI logs.
  if (result.error || result.status !== 0)
    throw new RecoveryError(
      `${command} failed. Check client installation/version, network, credentials and archive permissions. Any partial backup must not be used.`,
    );
}
