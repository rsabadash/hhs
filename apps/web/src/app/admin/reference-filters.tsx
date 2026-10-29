'use client';
import { useState } from 'react';
import ListControls from '@/components/list-controls';
import { type ReferenceKind, type Reference } from '@/lib/references';
import ReferencePicker from './reference-picker';
import type { Selection } from '@/lib/catalog';
const keys: Record<ReferenceKind, string[]> = {
  categories: ['parentId'],
  attributes: [],
  units: ['allowsFraction'],
  suppliers: ['hasContact'],
  warehouses: ['hasAddress'],
  'attribute-values': [],
};
type Props = {
  kind: ReferenceKind;
  query: string;
  parent: Reference | null;
  total: number;
};
export default function ReferenceFilters(props: Props) {
  return (
    <ListControls
      action={`/admin/${props.kind}`}
      query={props.query}
      placeholder={
        props.kind === 'suppliers'
          ? 'Назва, пошта або телефон'
          : 'Назва або позначення'
      }
      resultLabel={`Знайдено: ${props.total}`}
      filterKeys={keys[props.kind]}
    >
      <ReferenceFilterFields {...props} />
    </ListControls>
  );
}
function ReferenceFilterFields({ kind, query, parent }: Props) {
  const params = new URLSearchParams(query);
  const [selected, setSelected] = useState<Selection | null>(parent);
  const [scope, setScope] = useState(
    params.get('parentId') === 'root' ? 'root' : parent ? 'branch' : 'all',
  );
  return (
    <>
      {kind === 'categories' && (
        <>
          <label>
            Рівень категорій
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Усі категорії</option>
              <option value="root">Кореневі категорії</option>
              <option value="branch">Підкатегорії вибраної категорії</option>
            </select>
          </label>
          {scope === 'branch' && (
            <ReferencePicker
              kind="categories"
              label="Батьківська категорія"
              value={selected?.id || ''}
              initialLabel={selected?.name}
              onChange={setSelected}
            />
          )}
          <input
            type="hidden"
            name="parentId"
            value={
              scope === 'root'
                ? 'root'
                : scope === 'branch'
                  ? selected?.id || ''
                  : ''
            }
          />
        </>
      )}
      {kind === 'units' ? (
        <label>
          Кількість
          <select
            name="allowsFraction"
            defaultValue={params.get('allowsFraction') || ''}
          >
            <option value="">Будь-яка</option>
            <option value="false">Ціла</option>
            <option value="true">Дробова</option>
          </select>
        </label>
      ) : null}
      {kind === 'suppliers' ? (
        <label>
          Контакти
          <select
            name="hasContact"
            defaultValue={params.get('hasContact') || ''}
          >
            <option value="">Усі</option>
            <option value="true">Вказані</option>
            <option value="false">Не вказані</option>
          </select>
        </label>
      ) : null}
      {kind === 'warehouses' ? (
        <label>
          Адреса
          <select
            name="hasAddress"
            defaultValue={params.get('hasAddress') || ''}
          >
            <option value="">Усі</option>
            <option value="true">Вказана</option>
            <option value="false">Не вказана</option>
          </select>
        </label>
      ) : null}
    </>
  );
}
