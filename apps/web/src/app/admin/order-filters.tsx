'use client';
import ListControls from '@/components/list-controls';
import { useState } from 'react';
import { orderStatuses } from '@/lib/orders';
import type { Selection } from '@/lib/catalog';
import ReferencePicker from './reference-picker';
export default function OrderFilters({
  total,
  ...props
}: Parameters<typeof FilterFields>[0] & { total?: number }) {
  return (
    <ListControls
      action="/admin/orders"
      query={new URLSearchParams(props.query).toString()}
      placeholder="Номер, покупець, контакт, товар або SKU"
      resultLabel={`Знайдено: ${total}`}
      filterKeys={['warehouseId', 'status', 'from', 'to']}
      defaultSort="desc"
      sortOptions={[
        { value: 'desc', label: 'Спочатку нові' },
        { value: 'asc', label: 'Спочатку старі' },
      ]}
    >
      <FilterFields {...props} />
    </ListControls>
  );
}
function FilterFields({
  query,
  initialWarehouse,
}: {
  query: Record<string, string>;
  initialWarehouse: Selection | null;
}) {
  const [warehouse, setWarehouse] = useState(initialWarehouse);
  return (
    <>
      <div className="catalog-grid">
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
    </>
  );
}
