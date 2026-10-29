import { describe, it, expect } from 'vitest';
import { storefrontQuery } from './storefront.js';
describe('public catalog query boundary', () => {
  it('rejects internal filters and unbounded/invalid values', () => {
    for (const q of [
      { status: 'DRAFT' },
      { archived: 'true' },
      { warehouseId: '00000000-0000-4000-8000-000000000000' },
      { pageSize: 100 },
      { page: 0 },
      { minPrice: '2', maxPrice: '1' },
      { minPrice: 'invalid', maxPrice: '1' },
      { minPrice: '1', maxPrice: 'invalid' },
      { q: 'x'.repeat(101) },
      { valueIds: 'invalid' },
    ])
      expect(storefrontQuery.safeParse(q).success).toBe(false);
  });
  it('uses bounded defaults and accepts a zero minimum', () => {
    expect(
      storefrontQuery.parse({ minPrice: '0', maxPrice: '1' }),
    ).toMatchObject({ page: 1, pageSize: 12, minPrice: '0' });
  });
});
