import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  quantity,
  cost,
  supplyInput,
  countResults,
  inventoryQuery,
} from './inventory-validation.js';
describe('stock input rules', () => {
  it('accepts exact nonnegative decimals and rejects exponents, signs, overflow and excessive precision', () => {
    for (const v of ['0', '1', '12.345', '9999999999999.999'])
      expect(quantity.safeParse(v).success).toBe(true);
    for (const v of ['-1', '1e3', '1.0001', '10000000000000', 'NaN', '1,5', ''])
      expect(quantity.safeParse(v).success).toBe(false);
    expect(cost.safeParse('0.01').success).toBe(true);
    expect(cost.safeParse('0.001').success).toBe(false);
  });
  it('rejects duplicate supply SKUs, empty documents and zero receipt quantity', () => {
    const line = { variantId: randomUUID(), quantity: '1', unitCost: '0' };
    const doc = {
      reference: 'S1',
      warehouseId: randomUUID(),
      supplierId: randomUUID(),
      items: [line],
    };
    expect(supplyInput.safeParse(doc).success).toBe(true);
    for (const items of [[], [line, line], [{ ...line, quantity: '0' }]])
      expect(supplyInput.safeParse({ ...doc, items }).success).toBe(false);
  });
  it('distinguishes an uncounted line from an explicit zero and bounds query input', () => {
    const row = { variantId: randomUUID(), actualQuantity: null };
    expect(
      countResults.parse({ revision: 0, items: [row] }).items[0].actualQuantity,
    ).toBeNull();
    expect(
      countResults.parse({
        revision: 0,
        items: [{ ...row, actualQuantity: '0' }],
      }).items[0].actualQuantity,
    ).toBe('0');
    expect(
      inventoryQuery.safeParse({ from: '2026-10-30', to: '2026-10-29' })
        .success,
    ).toBe(false);
    expect(inventoryQuery.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});
