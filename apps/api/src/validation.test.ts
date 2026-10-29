import { describe, expect, it } from 'vitest';
import {
  attributeInput,
  attributeEditorInput,
  listQuery,
  parse,
  unitInput,
  valueInput,
} from './validation.js';
import { randomUUID } from 'node:crypto';
describe('reference validation', () => {
  it('validates inline attribute values and rejects duplicate labels and IDs', () => {
    const id = randomUUID();
    expect(
      parse(attributeEditorInput, {
        name: ' Діаметр ',
        values: [{ label: ' 4 мм ' }, { label: '6 мм' }],
      }),
    ).toEqual({
      name: 'Діаметр',
      values: [{ label: '4 мм' }, { label: '6 мм' }],
      removedValueIds: [],
    });
    for (const data of [
      { values: [{ label: 'Золото' }, { label: ' золото ' }] },
      { values: [{ label: ' ' }] },
      {
        values: [
          { id, label: '4' },
          { id, label: '6' },
        ],
      },
      { values: [{ id, label: '4' }], removedValueIds: [id] },
      {
        values: Array.from({ length: 1001 }, (_, i) => ({ label: String(i) })),
      },
    ])
      expect(() =>
        parse(attributeEditorInput, { name: 'Діаметр', ...data }),
      ).toThrow();
  });
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
