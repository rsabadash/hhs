import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
const safePath =
  /^(auth\/(login|logout|me)|references\/(categories|attributes|attribute-values|units|warehouses|suppliers)(\/[a-f0-9-]{36})?)$/;
const jsonError = (message: string, status: number) =>
  Response.json(
    { message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join('/');
  if (!safePath.test(path)) return jsonError('Сторінку не знайдено.', 404);
  const write = request.method !== 'GET';
  // Next may normalize request.url to its internal hostname. Host is the
  // browser-facing authority; never use client-supplied X-Forwarded-Host.
  const targetOrigin = `${request.nextUrl.protocol}//${request.headers.get('host') || request.nextUrl.host}`;
  if (
    write &&
    (request.headers.get('origin') !== targetOrigin ||
      request.headers.get('x-hhs-csrf') !== '1' ||
      !request.headers.get('content-type')?.startsWith('application/json'))
  ) {
    return jsonError('Запит відхилено. Оновіть сторінку.', 403);
  }
  let body: string | undefined;
  if (write) {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 32768) {
          await reader.cancel();
          return jsonError('Запит завеликий.', 413);
        }
        chunks.push(value);
      }
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  try {
    const upstream = new URL(
      `/admin/${path}`,
      process.env.API_URL || 'http://localhost:4000',
    );
    upstream.search = request.nextUrl.search;
    const response = await fetch(upstream, {
      method: request.method,
      headers: {
        cookie: request.headers.get('cookie') || '',
        ...(write
          ? { 'content-type': 'application/json', 'x-hhs-csrf': '1' }
          : {}),
      },
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(55000),
    });
    if (
      response.status >= 500 ||
      (response.status >= 300 && response.status < 400)
    )
      return jsonError('Сервіс тимчасово недоступний. Спробуйте ще раз.', 503);
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    for (const cookie of response.headers.getSetCookie())
      headers.append('Set-Cookie', cookie);
    return new Response(await response.text(), {
      status: response.status,
      headers,
    });
  } catch {
    return jsonError('Сервіс тимчасово недоступний. Спробуйте ще раз.', 503);
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
