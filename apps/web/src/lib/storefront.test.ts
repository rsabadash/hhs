import { describe, it, expect } from 'vitest';
import {
  uah,
  catalogParams,
  instagramProfile,
  inquiry,
  type PublicProduct,
} from './storefront';
describe('storefront URLs and contact', () => {
  it('formats UAH identically on the server and browser without floating point loss', () => {
    expect(uah('999999999999.99')).toBe(
      '999\u00a0999\u00a0999\u00a0999,99\u00a0₴',
    );
    expect(uah('0')).toBe('0,00\u00a0₴');
  });
  it('normalizes form attributes and excludes internal query keys', () => {
    expect(
      catalogParams({
        valueIds: ['one', '', 'two'],
        status: 'DRAFT',
        q: ' перлини ',
        page: '2',
        inStock: '',
      }).toString(),
    ).toBe(
      'q=%D0%BF%D0%B5%D1%80%D0%BB%D0%B8%D0%BD%D0%B8&page=2&valueIds=one%2Ctwo',
    );
  });
  it('allows only an Instagram handle, never arbitrary contact URLs', () => {
    expect(instagramProfile('@shop.ua')).toBe(
      'https://www.instagram.com/shop.ua/',
    );
    for (const value of [
      undefined,
      '',
      'https://example.test',
      '../other',
      'x?y',
      'x/y',
      'javascript:alert(1)',
    ])
      expect(instagramProfile(value)).toBeNull();
  });
  it('includes the selected SKU, price, unit and sold-out inquiry', () => {
    const variant = {
      id: 'a',
      name: '4 мм',
      sku: 'PEARL-4',
      price: '120.50',
      unit: { name: 'Штука', symbol: 'шт' },
      inStock: false,
      images: [],
      attributes: [],
    };
    const product: PublicProduct = {
      id: 'p',
      name: 'Перлини',
      description: '',
      category: { id: 'c', name: 'Перлини' },
      tags: [],
      images: [],
      attributes: [],
      variants: [variant],
    };
    expect(
      inquiry(product, variant, 'https://example.test/products/p?variant=a'),
    ).toContain('SKU: PEARL-4');
    expect(inquiry(product, variant, 'link')).toContain(
      'коли очікується надходження',
    );
    expect(inquiry(product, variant, 'link')).toContain('/ шт');
  });
});
