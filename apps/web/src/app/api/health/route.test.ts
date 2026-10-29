import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('returns only the public health contract and disables caching', async () => {
  vi.stubEnv('API_URL', 'https://api.example.test');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ status: 'ok', privateInfo: 'never expose' }),
      ),
  );
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it.each([
  () => Promise.resolve(Response.json({ status: 'failed' })),
  () => Promise.resolve(new Response('database credentials', { status: 503 })),
  () => Promise.reject(new Error('secret connection string')),
])('fails closed without leaking upstream details', async (fetchResult) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(fetchResult));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' });
});
