export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(
      new URL('/health/ready', process.env.API_URL || 'http://localhost:4000'),
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw new Error('Upstream unavailable');
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('status' in body) ||
      body.status !== 'ok'
    )
      throw new Error('Invalid upstream response');
    return Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
