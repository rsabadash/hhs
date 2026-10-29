import { describe, expect, it } from 'vitest';
import { connection, recover } from './recovery.mjs';

describe('database recovery safety', () => {
  it('rejects missing, non-postgres and pooled connections', () => {
    for (const value of [
      undefined,
      'https://example.com',
      'postgresql://user:pass@ep-example-pooler.example/db',
    ])
      expect(() => connection(value)).toThrow();
  });
  it('requires verified TLS remotely and keeps credentials out of command arguments', () => {
    const c = connection(
      'postgresql://user:p%40ss@db.example/db?sslmode=disable',
    );
    expect(c.options.password).toBe('p@ss');
    expect(c.env.PGSSLMODE).toBe('verify-full');
    expect(c.env.PGSSLROOTCERT).toBe('system');
    expect(c.options.ssl).toEqual({ rejectUnauthorized: true });
  });
  it('requires an explicit matching restore target confirmation', async () => {
    await expect(
      recover('restore', '/tmp/archive.dump', {
        RESTORE_DATABASE_URL: 'postgresql://user:pass@localhost/test',
      }),
    ).rejects.toThrow('RESTORE_CONFIRM_DATABASE');
  });
  it('rejects restoration over the backup source', async () => {
    const url = 'postgresql://user:pass@localhost/test';
    await expect(
      recover('restore', '/tmp/archive.dump', {
        BACKUP_DATABASE_URL: url,
        RESTORE_DATABASE_URL: url,
        RESTORE_CONFIRM_DATABASE: 'test',
      }),
    ).rejects.toThrow('must differ');
  });
});
