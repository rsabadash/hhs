export const sections = {
  categories: 'Категорії',
  attributes: 'Атрибути',
  'attribute-values': 'Значення атрибута',
  units: 'Одиниці',
  warehouses: 'Склади',
  suppliers: 'Постачальники',
} as const;
export type ReferenceKind = keyof typeof sections;
export type Reference = {
  id: string;
  name?: string;
  label?: string;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
  kind?: 'NUMBER' | 'CHOICE' | 'TEXT';
  measurementSymbol?: string | null;
  attributeId?: string;
  numericValue?: string | null;
  symbol?: string;
  allowsFraction?: boolean;
  address?: string;
  email?: string;
  phone?: string;
  _count?: { children?: number; values?: number };
};
export type ReferenceList = {
  items: Reference[];
  total: number;
  page: number;
  pageSize: number;
};
export async function writeAdmin(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown,
) {
  const response = await fetch(`/api/admin/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-hhs-csrf': '1' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'auth/login')
      // A hard navigation clears all cached admin layouts after session expiry.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/login?expired=1');
    throw Object.assign(
      new Error(
        Array.isArray(data.fields) && data.fields.length
          ? data.fields
              .slice(0, 3)
              .map((field: { message: string }) => field.message)
              .join(' ')
          : typeof data.message === 'string'
            ? data.message
            : 'Не вдалося зберегти дані.',
      ),
      { status: response.status },
    );
  }
  return data;
}
