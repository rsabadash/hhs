import 'server-only';
export class CatalogError extends Error {
  constructor(public status: number) {
    super('Каталог тимчасово недоступний.');
  }
}
export async function storefrontApi<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      new URL(
        `/catalog${path}`,
        process.env.API_URL || 'http://localhost:4000',
      ),
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    throw new CatalogError(503);
  }
  if (!response.ok) throw new CatalogError(response.status);
  return response.json();
}
