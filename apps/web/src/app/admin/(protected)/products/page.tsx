import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import {
  priceLabel,
  type Assignment,
  type CatalogProduct,
  type Selection,
} from '@/lib/catalog';
import ProductFilters from '../../product-filters';
type List = {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
};
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
    ),
  );
  const qs = new URLSearchParams(query);
  const ids = (query.valueIds || '').split(',').filter(Boolean).slice(0, 30);
  const [data, category, warehouse, attributes] = await Promise.all([
    adminApi<List>(`products?${qs}`),
    query.categoryId
      ? adminApi<Selection>(`references/categories/${query.categoryId}`)
      : null,
    query.warehouseId
      ? adminApi<Selection>(`references/warehouses/${query.warehouseId}`)
      : null,
    Promise.all(
      ids.map(async (id) => {
        const v = await adminApi<{
          id: string;
          attributeId: string;
          label: string;
        }>(`references/attribute-values/${id}`);
        const a = await adminApi<{
          name: string;
          measurementSymbol: string | null;
        }>(`references/attributes/${v.attributeId}`);
        return {
          attributeId: v.attributeId,
          valueId: v.id,
          value: { label: v.label, attribute: a },
        } satisfies Assignment;
      }),
    ),
  ]);
  const pageLink = (page: number) => {
    const p = new URLSearchParams(qs);
    p.set('page', String(page));
    return `/admin/products?${p}`;
  };
  return (
    <section className="catalog-page">
      <p className="eyebrow">Каталог</p>
      <div className="catalog-actions">
        <h1>Товари</h1>
        <Link className="primary" href="/admin/products/new">
          Додати товар
        </Link>
      </div>
      <ProductFilters
        key={qs.toString()}
        total={data.total}
        query={query}
        category={category}
        warehouse={warehouse}
        attributes={attributes}
      />
      {!data.items.length ? (
        <div className="catalog-card">
          <h2>
            {qs.size
              ? 'Немає товарів за цими фільтрами'
              : 'Додайте свій перший товар'}
          </h2>
          <p>Створіть товар і його варіанти з окремими SKU.</p>
        </div>
      ) : (
        <div className="product-list">
          {data.items.map((p) => (
            <article className="catalog-card" key={p.id}>
              <div className="catalog-actions">
                <div>
                  <h2>
                    <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
                  </h2>
                  <p className="muted">
                    {p.category.name}
                    {p.archivedAt ? ' · Архівний' : ''}
                  </p>
                </div>
                <Link href={`/admin/products/${p.id}`}>Редагувати</Link>
              </div>
              <div className="sku-list">
                {p.variants.map((v) => (
                  <div key={v.id}>
                    <strong>{v.sku}</strong>
                    <span>{priceLabel(v.sellPrice)}</span>
                    <span className="status-pill">
                      {v.archivedAt
                        ? 'Архівний'
                        : v.status === 'PUBLISHED'
                          ? 'Опубліковано'
                          : 'Чернетка'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="catalog-tags">
                {p.tags.map((t) => (
                  <span key={t.tag.name}>#{t.tag.name}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <nav className="catalog-actions" aria-label="Сторінки товарів">
        {data.page > 1 && <Link href={pageLink(data.page - 1)}>← Назад</Link>}
        <span>
          Сторінка {data.page} з{' '}
          {Math.max(1, Math.ceil(data.total / data.pageSize))}
        </span>
        {data.page * data.pageSize < data.total && (
          <Link href={pageLink(data.page + 1)}>Далі →</Link>
        )}
      </nav>
    </section>
  );
}
