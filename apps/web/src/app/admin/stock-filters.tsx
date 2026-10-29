'use client';
import Link from 'next/link';
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
    <form action={`/admin/inventory/${section}`} className="catalog-card">
      <div className="catalog-grid">
        <label>
          Пошук
          <input
            name="q"
            defaultValue={query.q}
            maxLength={100}
            placeholder={
              balance ? 'Назва або SKU' : 'Номер документа, назва або SKU'
            }
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
        <label>
          Сортування
          <select
            name="sort"
            defaultValue={query.sort || (balance ? 'asc' : 'desc')}
          >
            <option value="desc">
              {balance ? 'SKU: Я → А' : 'Спочатку нові'}
            </option>
            <option value="asc">
              {balance ? 'SKU: А → Я' : 'Спочатку старі'}
            </option>
          </select>
        </label>
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
        <input type="hidden" name="variantId" value={query.variantId} />
      )}
      <div className="catalog-actions">
        <button className="primary">Застосувати</button>
        <Link href={`/admin/inventory/${section}`}>Скинути фільтри</Link>
      </div>
    </form>
  );
}
