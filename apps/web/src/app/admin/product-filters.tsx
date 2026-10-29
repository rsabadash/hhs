'use client';
import ListControls from '@/components/list-controls';
import { useState } from 'react';
import ReferencePicker from './reference-picker';
import ProductAttributes from './product-attributes';
import type { Assignment, Selection } from '@/lib/catalog';
export default function ProductFilters({
  total,
  ...props
}: Parameters<typeof FilterFields>[0] & { total?: number }) {
  return (
    <ListControls
      action="/admin/products"
      query={new URLSearchParams(props.query).toString()}
      searchLabel="Пошук за назвою або SKU"
      placeholder="Пошук за назвою або SKU"
      resultLabel={`Знайдено товарів: ${total}`}
      filterKeys={[
        'categoryId',
        'tag',
        'status',
        'minPrice',
        'maxPrice',
        'warehouseId',
        'inStock',
        'archived',
        'valueIds',
      ]}
      filterDefaults={{ archived: 'false' }}
    >
      <FilterFields {...props} />
    </ListControls>
  );
}
function FilterFields({
  query,
  category: initialCategory,
  warehouse: initialWarehouse,
  attributes: initialAttributes,
}: {
  query: Record<string, string>;
  category: Selection | null;
  warehouse: Selection | null;
  attributes: Assignment[];
}) {
  const [category, setCategory] = useState(initialCategory);
  const [warehouse, setWarehouse] = useState(initialWarehouse);
  const [attributes, setAttributes] = useState(initialAttributes);
  return (
    <>
      <div className="catalog-grid">
        <ReferencePicker
          label="Категорія з підкатегоріями"
          kind="categories"
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
          Статус
          <select name="status" defaultValue={query.status || ''}>
            <option value="">Усі</option>
            <option value="DRAFT">Чернетка</option>
            <option value="PUBLISHED">Опубліковано</option>
          </select>
        </label>
        <label>
          Мін. ціна, грн
          <input
            name="minPrice"
            inputMode="decimal"
            defaultValue={query.minPrice}
            pattern="[0-9]+([.][0-9]{1,2})?"
          />
        </label>
        <label>
          Макс. ціна, грн
          <input
            name="maxPrice"
            inputMode="decimal"
            defaultValue={query.maxPrice}
            pattern="[0-9]+([.][0-9]{1,2})?"
          />
        </label>
        <ReferencePicker
          label="Склад"
          kind="warehouses"
          value={warehouse?.id || ''}
          initialLabel={warehouse?.name}
          onChange={setWarehouse}
        />
        {warehouse && (
          <input type="hidden" name="warehouseId" value={warehouse.id} />
        )}
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
          <select name="archived" defaultValue={query.archived || 'false'}>
            <option value="false">Активні</option>
            <option value="true">Архівні</option>
          </select>
        </label>
      </div>
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
  );
}
