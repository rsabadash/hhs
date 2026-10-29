import type { OrderPreview } from '@/lib/orders';
import { uah } from '@/lib/storefront';
export default function OrderLines({ data }: { data: OrderPreview }) {
  return (
    <section aria-label="Позиції замовлення">
      {data.items.map((i) => (
        <article className="catalog-card" key={i.variantId}>
          <h2>{i.sku}</h2>
          <p>{i.name}</p>
          <p>
            {i.quantity} {i.unitSymbol} × {uah(i.unitPrice)} ={' '}
            <strong>{uah(i.total)}</strong>
          </p>
          {i.available !== undefined && (
            <p>
              На складі: {i.available} {i.unitSymbol} → після замовлення:{' '}
              {i.remaining} {i.unitSymbol}
            </p>
          )}
        </article>
      ))}
      <p className="order-total">
        Разом: <strong>{uah(data.total)}</strong>
      </p>
    </section>
  );
}
