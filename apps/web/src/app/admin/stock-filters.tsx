'use client';
import ListControls from '@/components/list-controls';
import { useState } from 'react';
import type { Assignment, Selection } from '@/lib/catalog';
import {
  statuses,
  movementLabels,
  type InventorySection,
} from '@/lib/inventory';
import ReferencePicker from './reference-picker';
import ProductAttributes from './product-attributes';
export default function StockFilters({
  total,
  ...props
}: Parameters<typeof FilterFields>[0] & { total?: number }) {
  return (
    <ListControls
      action={`/admin/inventory/${props.section}`}
      query={new URLSearchParams(props.query).toString()}
      placeholder={
        props.section === 'balances'
          ? 'Назва або SKU'
          : 'Номер документа, назва або SKU'
      }
      resultLabel={
        total === undefined ? 'Виберіть склад у фільтрах' : `Знайдено: ${total}`
      }
      filterKeys={[
        'warehouseId',
        'supplierId',
        'categoryId',
        'dateField',
        'status',
        'kind',
        'from',
        'to',
        'tag',
        'inStock',
        'archived',
        'valueIds',
        'variantId',
      ]}
      filterDefaults={{ archived: 'all', dateField: 'createdAt' }}
      defaultSort={props.section === 'balances' ? 'asc' : 'desc'}
      sortOptions={
        props.section === 'balances'
          ? [
              { value: 'asc', label: 'SKU: А → Я' },
              { value: 'desc', label: 'SKU: Я → А' },
            ]
          : [
              { value: 'desc', label: 'Спочатку нові' },
              { value: 'asc', label: 'Спочатку старі' },
            ]
      }
    >
      <FilterFields {...props} />
    </ListControls>
  );
}
function FilterFields({
  section,
  query,
  selections,
  initialAttributes,
}: {
  section: InventorySection;
  query: Record<string, string>;
  selections: {
    warehouse: Selection | null;
    supplier: Selection | null;
    category: Selection | null;
  };
  initialAttributes: Assignment[];
}) {
  const [warehouse, setWarehouse] = useState(selections.warehouse),
    [supplier, setSupplier] = useState(selections.supplier),
    [category, setCategory] = useState(selections.category),
    [attributes, setAttributes] = useState(initialAttributes);
  const balance = section === 'balances';
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
        {section === 'supplies' && (
          <>
            <ReferencePicker
              kind="suppliers"
              label="Постачальник"
              value={supplier?.id || ''}
              initialLabel={supplier?.name}
              onChange={setSupplier}
            />
            {supplier && (
              <input type="hidden" name="supplierId" value={supplier.id} />
            )}
            <label>
              Дата
              <select
                name="dateField"
                defaultValue={query.dateField || 'createdAt'}
              >
                <option value="createdAt">Створення</option>
                <option value="receivedAt">Отримання</option>
              </select>
            </label>
          </>
        )}
        {(section === 'supplies' || section === 'counts') && (
          <label>
            Статус
            <select name="status" defaultValue={query.status || ''}>
              <option value="">Усі</option>
              {(section === 'supplies'
                ? ['DRAFT', 'RECEIVED']
                : ['DRAFT', 'COUNTING', 'POSTED', 'CANCELLED']
              ).map((v) => (
                <option key={v} value={v}>
                  {statuses[v]}
                </option>
              ))}
            </select>
          </label>
        )}
        {section === 'movements' && (
          <label>
            Операція
            <select name="kind" defaultValue={query.kind || ''}>
              <option value="">Усі</option>
              {Object.entries(movementLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!balance && (
          <>
            <label>
              З дати (UTC)
              <input type="date" name="from" defaultValue={query.from} />
            </label>
            <label>
              До дати включно (UTC)
              <input type="date" name="to" defaultValue={query.to} />
            </label>
          </>
        )}
        {balance && (
          <>
            <ReferencePicker
              kind="categories"
              label="Категорія з підкатегоріями"
              value={category?.id || ''}
              initialLabel={category?.name}
              onChange={setCategory}
            />
            {category && (
              <input type="hidden" name="categoryId" value={category.id} />
            )}
            <label>
              Тег
              <input name="tag" defaultValue={query.tag} maxLength={60} />
            </label>
            <label>
              Наявність
              <select name="inStock" defaultValue={query.inStock || ''}>
                <option value="">Усі</option>
                <option value="true">Є в наявності</option>
                <option value="false">Немає в наявності</option>
              </select>
            </label>
            <label>
              Товари
              <select name="archived" defaultValue={query.archived || 'all'}>
                <option value="all">Усі, включно з архівом</option>
                <option value="false">Активні</option>
                <option value="true">Архівні</option>
              </select>
            </label>
          </>
        )}
      </div>
      {balance && (
        <>
          <details open={attributes.length > 0}>
            <summary>Фільтр за атрибутами</summary>
            <ProductAttributes value={attributes} onChange={setAttributes} />
          </details>
          {attributes.some((a) => a.valueId) && (
            <input
              type="hidden"
              name="valueIds"
              value={attributes
                .map((a) => a.valueId)
                .filter(Boolean)
                .join(',')}
            />
          )}
        </>
      )}
      {query.variantId && (
        <label>
          Вибраний SKU
          <select name="variantId" defaultValue={query.variantId}>
            <option value={query.variantId}>Лише вибраний SKU</option>
            <option value="">Усі SKU</option>
          </select>
        </label>
      )}
    </>
  );
}
