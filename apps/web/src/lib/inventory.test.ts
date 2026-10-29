import { it, expect } from 'vitest';
import { lineCost, moneyFromCents, quantityDifference } from './inventory';
it('preserves thousandths in large physical count differences', () => {
  expect(quantityDifference('9999999999999.999', '9999999999999.998')).toBe(
    '0,001',
  );
  expect(quantityDifference('0', '0.001')).toBe('-0,001');
  expect(quantityDifference('3', '3.000')).toBe('0');
  expect(quantityDifference('', '1')).toBe('Перевірте кількість');
});
it('calculates purchase totals in integer cents with half-up rounding', () => {
  expect(moneyFromCents(lineCost('5', '2.50') + lineCost('2', '3'))).toBe(
    '18.50',
  );
  expect(moneyFromCents(lineCost('0.5', '0.01'))).toBe('0.01');
});
