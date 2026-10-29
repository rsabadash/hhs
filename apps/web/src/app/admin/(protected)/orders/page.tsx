import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import type { Selection } from '@/lib/catalog';
import { stockDate, type InventoryList } from '@/lib/inventory';
import { orderStatuses, type OrderDocument } from '@/lib/orders';
import { uah } from '@/lib/storefront';
import OrderFilters from '../../order-filters';
export default async function OrdersPage({
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
  const [data, warehouse] = await Promise.all([
    adminApi<InventoryList<OrderDocument>>(`orders?${qs}`),
    query.warehouseId
      ? adminApi<Selection>(`references/warehouses/${query.warehouseId}`)
      : null,
  ]);
  const pageLink = (page: number) => {
    const p = new URLSearchParams(qs);
    p.set('page', String(page));
    return `/admin/orders?${p}`;
  };
  return (
    <div className="catalog-page order-page">
      <div className="catalog-actions">
        <h1>Замовлення</h1>
        <Link className="primary" href="/admin/orders/new">
          Нове замовлення
        </Link>
      </div>
      <OrderFilters
        key={qs.toString()}
        total={data.total}
        query={query}
        initialWarehouse={warehouse}
      />
      {!data.items.length && (
        <p>Замовлень не знайдено. Створіть замовлення або змініть фільтри.</p>
      )}
      {data.items.map((doc) => (
        <article className="catalog-card" key={doc.id}>
          <h2 className="order-reference">
            <Link href={`/admin/orders/${doc.id}`}>{doc.reference}</Link>
          </h2>
          <p>
            {orderStatuses[doc.status]} · {uah(doc.total)}
          </p>
          <p>
            {doc.customerName} · {doc.contact}
          </p>
          <p>
            {doc.warehouse.name} · {stockDate(doc.createdAt)}
          </p>
        </article>
      ))}
      <nav className="catalog-actions" aria-label="Сторінки замовлень">
        {data.page > 1 && <Link href={pageLink(data.page - 1)}>Назад</Link>}
        <span>
          Сторінка {data.page} з{' '}
          {Math.max(1, Math.ceil(data.total / data.pageSize))}
        </span>
        {data.page * data.pageSize < data.total && (
          <Link href={pageLink(data.page + 1)}>Далі</Link>
        )}
      </nav>
    </div>
  );
}
