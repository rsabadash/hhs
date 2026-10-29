import { expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

it('salts passwords independently and rejects incorrect passwords and corrupt hashes', async () => {
  const password = 'Тестовий пароль для адміністратора';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  expect(first).not.toBe(second);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword('incorrect', first)).toBe(false);
  expect(await verifyPassword(password, 'broken')).toBe(false);
  expect(await verifyPassword(password, 'scrypt:salt:bad')).toBe(false);
});
