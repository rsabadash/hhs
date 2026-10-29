'use client';
import Link from 'next/link';
import { useState } from 'react';
import { orderStatuses } from '@/lib/orders';
import type { Selection } from '@/lib/catalog';
import ReferencePicker from './reference-picker';
export default function OrderFilters({
  query,
  initialWarehouse,
}: {
  query: Record<string, string>;
  initialWarehouse: Selection | null;
}) {
  const [warehouse, setWarehouse] = useState(initialWarehouse);
  return (
    <form action="/admin/orders" className="catalog-card">
      <div className="catalog-grid">
        <label>
          Пошук
          <input
            name="q"
            maxLength={100}
            defaultValue={query.q}
            placeholder="Номер, покупець, контакт, товар або SKU"
          />
        </label>
        <ReferencePicker
          kind="warehouses"
          label="Склад"
          value={warehouse?.id || ''}
          initialLabel={warehouse?.name}
          onChange={setWarehouse}
        />
        {warehouse && (
          <input type="hidden" name="warehouseId" value={warehouse.id} />
        )}
        <label>
          Статус
          <select name="status" defaultValue={query.status || ''}>
            <option value="">Усі</option>
            {Object.entries(orderStatuses).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Від (UTC)
          <input type="date" name="from" defaultValue={query.from} />
        </label>
        <label>
          До (UTC)
          <input type="date" name="to" defaultValue={query.to} />
        </label>
      </div>
      <div className="catalog-actions">
        <button type="submit" className="primary">
          Застосувати
        </button>
        <Link href="/admin/orders">Скинути</Link>
      </div>
    </form>
  );
}
