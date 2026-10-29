import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

describe('runtime configuration', () => {
  it('requires PostgreSQL and a valid listening port', () => {
    expect(
      readConfig({ DATABASE_URL: 'postgresql://localhost/hhs' }).PORT,
    ).toBe(4000);
    expect(() => readConfig({ DATABASE_URL: 'https://example.com' })).toThrow(
      'DATABASE_URL',
    );
    expect(() =>
      readConfig({ DATABASE_URL: 'postgresql://localhost/hhs', PORT: '70000' }),
    ).toThrow('PORT');
  });
  it('never includes secrets in validation errors', () => {
    expect(() => readConfig({ DATABASE_URL: 'secret-password' })).toThrow(
      /^Invalid configuration: DATABASE_URL$/,
    );
  });
});
