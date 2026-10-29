import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
const context = { params: Promise.resolve({ path: ['auth', 'login'] }) };
function request(headers: Record<string, string> = {}, body = '{}') {
  return new NextRequest('http://localhost:3000/api/admin/auth/login', {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
      'x-hhs-csrf': '1',
      ...headers,
    },
    body,
  });
}
afterEach(() => vi.unstubAllGlobals());
describe('admin proxy security', () => {
  it('accepts the browser Host even when Next normalizes its internal hostname', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"id":"admin"}', {
        headers: {
          'set-cookie': 'hhs_session=opaque; HttpOnly; SameSite=Strict; Path=/',
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await POST(request(), context);
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.headers.get('set-cookie')).toContain('HttpOnly');
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects foreign/missing origins, missing CSRF headers, and spoofed forwarded hosts', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const cases: Record<string, string>[] = [
      { origin: 'https://evil.test' },
      { origin: '' },
      { 'x-hhs-csrf': '' },
      { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' },
    ];
    for (const headers of cases)
      expect((await POST(request(headers), context)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies before forwarding', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request({}, 'x'.repeat(32769)), context)).status).toBe(
      413,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows a bounded batch of attribute values without raising other reference limits', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'attribute' }));
    vi.stubGlobal('fetch', fetch);
    const body = JSON.stringify({
      name: 'Діаметр',
      values: Array.from({ length: 1000 }, (_, index) => ({
        label: `${index} мм натуральні перлини`,
      })),
    });
    expect(Buffer.byteLength(body)).toBeGreaterThan(32768);
    const attributeContext = {
      params: Promise.resolve({ path: ['references', 'attributes'] }),
    };
    expect((await POST(request({}, body), attributeContext)).status).toBe(200);
    expect(
      (await POST(request({}, 'x'.repeat(1048577)), attributeContext)).status,
    ).toBe(413);
    expect(
      (
        await POST(request({}, body), {
          params: Promise.resolve({ path: ['references', 'units'] }),
        })
      ).status,
    ).toBe(413);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects unknown and traversal paths without contacting the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const path of [
      ['..', 'health'],
      ['orders', '..', 'auth'],
      ['debug'],
      ['https:', 'evil.test'],
    ])
      expect(
        (await POST(request(), { params: Promise.resolve({ path }) })).status,
      ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sanitizes upstream failures and redirects and keeps errors uncached', async () => {
    for (const response of [
      new Response('private-database-detail', { status: 500 }),
      new Response(null, {
        status: 302,
        headers: { location: 'https://external.invalid' },
      }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      const result = await POST(request(), context);
      expect(result.status).toBe(503);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(await result.text()).not.toMatch(
        /private-database-detail|external.invalid/,
      );
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private-database-detail')),
    );
    const result = await POST(request(), context);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('private-database-detail');
  });
});
