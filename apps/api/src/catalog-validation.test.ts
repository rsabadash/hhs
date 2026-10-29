import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  productInput,
  catalogQuery,
  normalizeTag,
} from './catalog-validation.js';
import { imageBytes } from './images.js';
const a = randomUUID(),
  value = randomUUID();
const variant = {
  name: 'Білий',
  sku: ' pe-01 ',
  unitId: randomUUID(),
  status: 'DRAFT',
  sellPrice: null,
  archived: false,
  attributes: [],
};
const product = {
  name: 'Перлини',
  description: '',
  categoryId: randomUUID(),
  archived: false,
  tags: [' Перлини ', 'перлини'],
  attributes: [],
  variants: [variant],
};
describe('catalog input invariants', () => {
  it('canonicalizes SKU and deduplicates Unicode tags', () => {
    const parsed = productInput.parse(product);
    expect(parsed.variants[0].sku).toBe('PE-01');
    expect(parsed.tags).toEqual(['перлини']);
    expect(normalizeTag('  Рожеві   Перлини ')).toBe('рожеві перлини');
  });
  it('rejects duplicate variants and shared attribute overrides', () => {
    expect(
      productInput.safeParse({
        ...product,
        variants: [variant, { ...variant, sku: 'PE-02' }],
      }).success,
    ).toBe(false);
    expect(
      productInput.safeParse({
        ...product,
        attributes: [{ attributeId: a, valueId: value }],
        variants: [
          { ...variant, attributes: [{ attributeId: a, valueId: value }] },
        ],
      }).success,
    ).toBe(false);
  });
  it('requires positive exact prices for publication and bounded decimal precision', () => {
    for (const sellPrice of [null, '0', '-1', '1.001', '1e4'])
      expect(
        productInput.safeParse({
          ...product,
          variants: [{ ...variant, status: 'PUBLISHED', sellPrice }],
        }).success,
      ).toBe(false);
    expect(
      productInput.safeParse({
        ...product,
        variants: [{ ...variant, status: 'PUBLISHED', sellPrice: '12.50' }],
      }).success,
    ).toBe(true);
    expect(
      catalogQuery.safeParse({ minPrice: '20', maxPrice: '10' }).success,
    ).toBe(false);
  });
  it('rejects arbitrary URLs, SVGs, spoofed MIME and oversized image payloads', () => {
    for (const input of [
      'https://example.com/photo.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,aGVsbG8=',
    ])
      expect(() => imageBytes(input)).toThrow();
    expect(() =>
      imageBytes(
        `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`,
      ),
    ).toThrow();
    expect(
      imageBytes(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQ8bX9DwAC9QGuYeB4NwAAAABJRU5ErkJggg==',
      ).length,
    ).toBeGreaterThan(8);
  });
});
