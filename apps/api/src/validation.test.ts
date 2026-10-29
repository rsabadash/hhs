import { describe, expect, it } from 'vitest';
import {
  attributeInput,
  listQuery,
  parse,
  unitInput,
  valueInput,
} from './validation.js';
import { randomUUID } from 'node:crypto';
describe('reference validation', () => {
  it('rejects unbounded pagination and unknown filters', () => {
    for (const query of [
      { page: '0' },
      { pageSize: '999' },
      { sort: 'DROP' },
      { secret: 'x' },
    ])
      expect(() => parse(listQuery, query)).toThrow();
  });
  it('preserves exact numbers and rejects excess precision / nonfinite values', () => {
    for (const numericValue of [
      '1.12345',
      'NaN',
      'Infinity',
      '1e5',
      '1000000000000',
    ])
      expect(() =>
        parse(valueInput, {
          attributeId: randomUUID(),
          label: 'x',
          numericValue,
        }),
      ).toThrow();
    expect(
      parse(valueInput, {
        attributeId: randomUUID(),
        label: '0.1000',
        numericValue: '0.1000',
      }).numericValue,
    ).toBe('0.1000');
  });
  it('requires meaningful unit fields and a real boolean', () => {
    expect(() =>
      parse(unitInput, { name: ' ', symbol: 'шт', allowsFraction: false }),
    ).toThrow();
    expect(() =>
      parse(unitInput, {
        name: 'Штука',
        symbol: 'шт',
        allowsFraction: 'false',
      }),
    ).toThrow();
  });
  it('only numeric attributes carry measurement units', () => {
    expect(() =>
      parse(attributeInput, {
        name: 'Покриття',
        kind: 'CHOICE',
        measurementSymbol: 'мм',
      }),
    ).toThrow();
    expect(
      parse(attributeInput, {
        name: ' Діаметр ',
        kind: 'NUMBER',
        measurementSymbol: 'мм',
      }).name,
    ).toBe('Діаметр');
  });
});
