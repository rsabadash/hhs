import { it, expect } from 'vitest';
import { purchaseTotal, stockDecimal } from './inventory-math.js';
it('rounds each purchase line half-up before summing', () => {
  const line = {
    quantity: stockDecimal('0.5'),
    unitCost: stockDecimal('0.01'),
  };
  expect(purchaseTotal([line, line])).toBe('0.02');
});
it('retains all digits at the maximum supported document amounts', () => {
  const quantity = '9999999999999.999',
    cost = '999999999999.99';
  const thousandths = 9999999999999999n,
    cents = 99999999999999n;
  const roundedCents = (thousandths * cents + 500n) / 1000n;
  const expected = roundedCents * 100n;
  expect(
    purchaseTotal(
      Array.from({ length: 100 }, () => ({
        quantity: stockDecimal(quantity),
        unitCost: stockDecimal(cost),
      })),
    ),
  ).toBe(`${expected / 100n}.${String(expected % 100n).padStart(2, '0')}`);
});
