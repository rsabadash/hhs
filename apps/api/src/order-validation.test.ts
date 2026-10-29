import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  orderDraft,
  orderInput,
  orderLines,
  orderQuery,
} from './order-validation.js';
const id = randomUUID();
describe('order input', () => {
  it('keeps newest-first as default and bounds order sorting', () => {
    expect(orderQuery.parse({}).sort).toBe('desc');
    expect(orderQuery.parse({ sort: 'asc' }).sort).toBe('asc');
    expect(orderQuery.safeParse({ sort: 'invalid' }).success).toBe(false);
  });
  it('aggregates decimal quantities and canonicalizes equivalent prices', () => {
    expect(
      orderLines([
        { variantId: id, quantity: '0.1', unitPrice: '2' },
        { variantId: id, quantity: '0.2', unitPrice: '2.00' },
      ]),
    ).toEqual([{ variantId: id, quantity: '0.3', unitPrice: '2.00' }]);
  });
  it('rejects conflicting prices and aggregate overflow', () => {
    expect(() =>
      orderLines([
        { variantId: id, quantity: '1', unitPrice: '2' },
        { variantId: id, quantity: '1', unitPrice: '3' },
      ]),
    ).toThrow();
    expect(() =>
      orderLines([
        { variantId: id, quantity: '9999999999999.999' },
        { variantId: id, quantity: '0.001' },
      ]),
    ).toThrow();
  });
  it('requires reviewed prices, buyer and bounded positive quantities', () => {
    const draft = {
      warehouseId: id,
      customerName: 'Ірина',
      contact: '@iryna',
      items: [{ variantId: id, quantity: '1' }],
    };
    expect(orderDraft.safeParse(draft).success).toBe(true);
    expect(orderInput.safeParse({ ...draft, requestKey: id }).success).toBe(
      false,
    );
    for (const quantity of ['0', '-1', '1.0001', '1e2'])
      expect(
        orderDraft.safeParse({ ...draft, items: [{ variantId: id, quantity }] })
          .success,
      ).toBe(false);
    expect(orderDraft.safeParse({ ...draft, contact: ' ' }).success).toBe(
      false,
    );
    expect(
      orderQuery.safeParse({ from: '2026-10-30', to: '2026-10-29' }).success,
    ).toBe(false);
  });
});
