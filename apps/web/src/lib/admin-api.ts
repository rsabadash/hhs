import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function adminApi<T>(path: string): Promise<T> {
  const jar = await cookies();
  const token = jar.get('hhs_session')?.value;
  if (!token) redirect('/admin/login');
  const response = await fetch(
    new URL(`/admin/${path}`, process.env.API_URL || 'http://localhost:4000'),
    {
      headers: { cookie: `hhs_session=${encodeURIComponent(token)}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(55000),
    },
  );
  if (response.status === 401) redirect('/admin/login?expired=1');
  if (!response.ok)
    throw new Error('Не вдалося завантажити дані. Спробуйте ще раз.');
  return response.json();
}
