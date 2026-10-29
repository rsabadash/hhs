import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import type { Selection, Assignment } from '@/lib/catalog';
import {
  attributesLabel,
  inventorySections,
  statuses,
  stockDate,
  movementLabels,
  variantLabel,
  type InventorySection,
  type InventoryList,
  type StockDocument,
  type StockVariant,
  type StockMovement,
} from '@/lib/inventory';
import StockFilters from '../../../stock-filters';
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section: rawSection } = await params;
  if (!Object.hasOwn(inventorySections, rawSection)) notFound();
  const section = rawSection as InventorySection;
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
    ),
  );
  if (section === 'balances') {
    query.archived ||= 'all';
    query.sort ||= 'asc';
  }
  const qs = new URLSearchParams(query);
  const [data, warehouse, supplier, category, attributes] = await Promise.all([
    section === 'balances' && !query.warehouseId
      ? null
      : adminApi<InventoryList<StockDocument | StockVariant | StockMovement>>(
          `inventory/${section}?${qs}`,
        ),
    query.warehouseId
      ? adminApi<Selection>(`references/warehouses/${query.warehouseId}`)
      : null,
    query.supplierId
      ? adminApi<Selection>(`references/suppliers/${query.supplierId}`)
      : null,
    query.categoryId
      ? adminApi<Selection>(`references/categories/${query.categoryId}`)
      : null,
    Promise.all(
      (query.valueIds || '')
        .split(',')
        .filter(Boolean)
        .slice(0, 30)
        .map(async (id) => {
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
    return `/admin/inventory/${section}?${p}`;
  };
  return (
    <section className="catalog-page">
      <p className="eyebrow">Складський облік</p>
      <div className="catalog-actions">
        <h1>{inventorySections[section]}</h1>
        {(section === 'supplies' || section === 'counts') && (
          <Link className="primary" href={`/admin/inventory/${section}/new`}>
            {section === 'supplies' ? 'Нове постачання' : 'Нова інвентаризація'}
          </Link>
        )}
      </div>
      <StockFilters
        key={qs.toString()}
        section={section}
        query={query}
        selections={{ warehouse, supplier, category }}
        initialAttributes={attributes}
      />
      {!data ? (
        <p>Виберіть склад, щоб переглянути залишки, включно з нульовими.</p>
      ) : (
        <>
          <p role="status">Знайдено: {data.total}</p>
          {!data.items.length && (
            <div className="catalog-card">
              <h2>
                {Object.keys(raw).length
                  ? 'Немає результатів за цими фільтрами'
                  : 'Ще немає записів'}
              </h2>
              <p>Змініть фільтри або створіть перший документ.</p>
            </div>
          )}
          <div className="product-list">
            {data.items.map((row) => {
              if (section === 'balances') {
                const v = row as StockVariant;
                return (
                  <article className="catalog-card" key={v.id}>
                    <h2>{variantLabel(v)}</h2>
                    <p>{attributesLabel(v)}</p>
                    <p>
                      Залишок:{' '}
                      <strong>
                        {v.quantity} {v.unit.symbol}
                      </strong>{' '}
                      · {warehouse?.name}
                    </p>
                    <Link
                      href={`/admin/inventory/movements?variantId=${v.id}&warehouseId=${query.warehouseId}`}
                    >
                      Історія рухів
                    </Link>
                  </article>
                );
              }
              if (section === 'movements') {
                const m = row as StockMovement;
                const source =
                  m.supplyItem?.supply ||
                  m.countItem?.count ||
                  m.orderItem?.order;
                const sourceSection = m.supplyItem
                  ? 'supplies'
                  : m.countItem
                    ? 'counts'
                    : null;
                return (
                  <article className="catalog-card" key={m.id}>
                    <h2>
                      {movementLabels[m.kind]} · {m.quantity}{' '}
                      {m.balance.variant.unit.symbol}
                    </h2>
                    <p>{variantLabel(m.balance.variant)}</p>
                    <p>
                      {m.balance.warehouse.name} · {stockDate(m.createdAt)} ·{' '}
                      {m.actor.email}
                    </p>
                    {source &&
                      (sourceSection ? (
                        <Link
                          href={`/admin/inventory/${sourceSection}/${source.id}`}
                        >
                          {source.reference}
                        </Link>
                      ) : (
                        <span>{source.reference}</span>
                      ))}
                  </article>
                );
              }
              const d = row as StockDocument;
              return (
                <article className="catalog-card" key={d.id}>
                  <div className="catalog-actions">
                    <h2>
                      <Link href={`/admin/inventory/${section}/${d.id}`}>
                        {d.reference}
                      </Link>
                    </h2>
                    <span className="status-pill">{statuses[d.status]}</span>
                  </div>
                  <p>
                    {d.warehouse.name}
                    {d.supplier ? ` · ${d.supplier.name}` : ''}
                  </p>
                  <p>
                    {stockDate(d.createdAt)}
                    {d.total ? ` · ${d.total} грн` : ''}
                  </p>
                  {d.receivedAt && <p>Отримано: {stockDate(d.receivedAt)}</p>}
                </article>
              );
            })}
          </div>
          <nav
            className="catalog-actions"
            aria-label="Сторінки складського обліку"
          >
            {data.page > 1 && (
              <Link href={pageLink(data.page - 1)}>← Назад</Link>
            )}
            <span>
              Сторінка {data.page} з{' '}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            {data.page * data.pageSize < data.total && (
              <Link href={pageLink(data.page + 1)}>Далі →</Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
