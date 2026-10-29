import { expect, it } from 'vitest';
import { filterValues, listQuery } from './list-query';
it('search and sorting reset pagination without dropping filters or scope', () => {
  const params = new URLSearchParams(
    listQuery('page=4&attributeId=diameter&kind=NUMBER&q=old&sort=desc', {
      q: ' перлини & золото ',
    }),
  );
  expect(Object.fromEntries(params)).toEqual({
    attributeId: 'diameter',
    kind: 'NUMBER',
    q: 'перлини & золото',
    sort: 'desc',
  });
});
it('clearing filters preserves search, sorting and attribute context', () => {
  const params = new URLSearchParams(
    listQuery(
      'q=pearl&sort=desc&page=9&attributeId=diameter&status=DRAFT&valueIds=4,8',
      {},
      ['status', 'valueIds'],
    ),
  );
  expect(Object.fromEntries(params)).toEqual({
    q: 'pearl',
    sort: 'desc',
    attributeId: 'diameter',
  });
});
it('combines multiple attribute selectors and omits empty selections', () => {
  const data = new FormData();
  data.append('valueIds', 'diameter-4');
  data.append('valueIds', '');
  data.append('valueIds', 'coating-gold');
  data.set('inStock', 'false');
  data.set('minPrice', '0');
  expect(filterValues(data)).toEqual({
    valueIds: 'diameter-4,coating-gold',
    inStock: 'false',
    minPrice: '0',
  });
});
