import Link from 'next/link';
import type { PublicFilters } from '../../lib/storefront';
export function Filters({
  filters,
  params,
}: {
  filters: PublicFilters;
  params: URLSearchParams;
}) {
  const selected = new Set(params.get('valueIds')?.split(',') ?? []);
  const categories = new Map(filters.categories.map((c) => [c.id, c]));
  const categoryLabel = (id: string) => {
    const names: string[] = [];
    const seen = new Set<string>();
    let c = categories.get(id);
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      names.unshift(c.name);
      c = c.parentId ? categories.get(c.parentId) : undefined;
    }
    return names.join(' / ');
  };
  const attributes = new Map<string, PublicFilters['values']>();
  for (const value of filters.values)
    attributes.set(value.attribute.id, [
      ...(attributes.get(value.attribute.id) ?? []),
      value,
    ]);
  return (
    <form action="/" className="catalog-filters" key={params.toString()}>
      <label>
        Пошук
        <input
          type="search"
          name="q"
          defaultValue={params.get('q') ?? ''}
          maxLength={100}
          placeholder="Назва або SKU"
        />
      </label>
      <label>
        Категорія
        <select name="categoryId" defaultValue={params.get('categoryId') ?? ''}>
          <option value="">Усі категорії</option>
          {filters.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c.id)}
            </option>
          ))}
        </select>
      </label>
      <details
        open={Boolean(
          params.get('valueIds') ||
          params.get('tag') ||
          params.get('minPrice') ||
          params.get('maxPrice') ||
          params.get('inStock'),
        )}
      >
        <summary>Фільтри та сортування</summary>
        <label>
          Тег
          <select name="tag" defaultValue={params.get('tag') ?? ''}>
            <option value="">Усі теги</option>
            {filters.tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="price-fields">
          <label>
            Ціна від, ₴
            <input
              name="minPrice"
              type="number"
              min="0"
              max="999999999999.99"
              step="0.01"
              defaultValue={params.get('minPrice') ?? ''}
            />
          </label>
          <label>
            Ціна до, ₴
            <input
              name="maxPrice"
              type="number"
              min="0"
              max="999999999999.99"
              step="0.01"
              defaultValue={params.get('maxPrice') ?? ''}
            />
          </label>
        </div>
        <label>
          Наявність
          <select name="inStock" defaultValue={params.get('inStock') ?? ''}>
            <option value="">Усі товари</option>
            <option value="true">Є в наявності</option>
            <option value="false">Немає в наявності</option>
          </select>
        </label>
        {Array.from(attributes, ([id, values]) => (
          <label key={id}>
            {values[0].attribute.name}
            {values[0].attribute.measurementSymbol
              ? `, ${values[0].attribute.measurementSymbol}`
              : ''}
            <select
              name="valueIds"
              defaultValue={values.find((v) => selected.has(v.id))?.id ?? ''}
            >
              <option value="">Усі значення</option>
              {values.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Сортування
          <select name="sort" defaultValue={params.get('sort') ?? 'asc'}>
            <option value="asc">За назвою: А–Я</option>
            <option value="desc">За назвою: Я–А</option>
          </select>
        </label>
      </details>
      <button type="submit">Застосувати</button>
      <Link href="/">Скинути фільтри</Link>
    </form>
  );
}
