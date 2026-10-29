'use client';
import { useState } from 'react';
import {
  kindLabels,
  writeAdmin,
  type Reference,
  type ReferenceKind,
} from '@/lib/references';

function CategoryPicker({
  initial,
  exclude,
}: {
  initial?: { id: string; name: string } | null;
  exclude?: string;
}) {
  const [selected, setSelected] = useState(initial?.id || '');
  const [options, setOptions] = useState<Reference[]>(initial ? [initial] : []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function find(nextPage: number) {
    setPending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/references/categories?${new URLSearchParams({ q: search, page: String(nextPage) })}`,
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      setOptions((old) => [
        ...new Map(
          [
            ...(nextPage === 1
              ? old.filter((item) => item.id === selected)
              : old),
            ...data.items,
          ].map((item: Reference) => [item.id, item]),
        ).values(),
      ]);
      setPage(nextPage);
      setTotal(data.total);
    } catch {
      setError('Не вдалося знайти категорії. Спробуйте ще раз.');
    } finally {
      setPending(false);
    }
  }
  return (
    <fieldset className="category-picker">
      <legend>Батьківська категорія</legend>
      <label>
        Пошук категорії
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          maxLength={100}
        />
      </label>
      <button type="button" disabled={pending} onClick={() => find(1)}>
        Знайти категорію
      </button>
      <label>
        Розмістити в
        <select
          name="parentId"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Без батьківської категорії</option>
          {options
            .filter((item) => item.id !== exclude)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      {page > 0 && page * 20 < total ? (
        <button type="button" disabled={pending} onClick={() => find(page + 1)}>
          Ще категорії
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </fieldset>
  );
}

export default function ReferenceForm({
  kind,
  record,
  attribute,
  parent,
  onSaved,
  onCancel,
}: {
  kind: ReferenceKind;
  record?: Reference;
  attribute: Reference | null;
  parent: Reference | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState(record?.kind || 'CHOICE');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const numeric = kind === 'attribute-values' && attribute?.kind === 'NUMBER';
  return (
    <section className="editor" aria-labelledby="editor-title">
      <div className="section-heading">
        <h2 id="editor-title">
          {record ? 'Редагування запису' : 'Новий запис'}
        </h2>
        <button type="button" disabled={pending} onClick={onCancel}>
          Скасувати
        </button>
      </div>
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError('');
          const fields = new FormData(event.currentTarget);
          const text = (key: string) => String(fields.get(key) || '').trim();
          let data: object = { name: text('name') };
          if (kind === 'categories')
            data = { ...data, parentId: text('parentId') || null };
          if (kind === 'units')
            data = {
              ...data,
              symbol: text('symbol'),
              allowsFraction: fields.get('allowsFraction') === 'on',
            };
          if (kind === 'warehouses')
            data = { ...data, address: text('address') };
          if (kind === 'suppliers')
            data = { ...data, email: text('email'), phone: text('phone') };
          if (kind === 'attributes')
            data = {
              ...data,
              kind: type,
              measurementSymbol:
                type === 'NUMBER' ? text('measurementSymbol') || null : null,
            };
          if (kind === 'attribute-values')
            data = {
              attributeId: attribute?.id,
              label: numeric
                ? text('numericValue').replace(',', '.')
                : text('label'),
              numericValue: numeric
                ? text('numericValue').replace(',', '.')
                : null,
            };
          try {
            await writeAdmin(
              `references/${kind}${record ? `/${record.id}` : ''}`,
              record ? 'PUT' : 'POST',
              data,
            );
            onSaved();
          } catch (error) {
            setError(
              error instanceof Error ? error.message : 'Не вдалося зберегти.',
            );
            setPending(false);
          }
        }}
      >
        {kind !== 'attribute-values' ? (
          <label>
            Назва
            <input
              name="name"
              defaultValue={record?.name || ''}
              required
              maxLength={160}
              autoFocus
            />
          </label>
        ) : numeric ? (
          <label>
            Числове значення
            {attribute?.measurementSymbol
              ? ` (${attribute.measurementSymbol})`
              : ''}
            <input
              name="numericValue"
              defaultValue={record?.numericValue || ''}
              inputMode="decimal"
              required
              maxLength={18}
              autoFocus
            />
            <small>До 4 знаків після крапки. Назва формується з числа.</small>
          </label>
        ) : (
          <label>
            Значення
            <input
              name="label"
              defaultValue={record?.label || ''}
              required
              maxLength={160}
              autoFocus
            />
          </label>
        )}
        {kind === 'categories' ? (
          <CategoryPicker
            initial={
              record
                ? record.parent
                : parent
                  ? { id: parent.id, name: parent.name || '' }
                  : null
            }
            exclude={record?.id}
          />
        ) : null}
        {kind === 'units' ? (
          <>
            <label>
              Позначення
              <input
                name="symbol"
                defaultValue={record?.symbol || ''}
                required
                maxLength={20}
                placeholder="шт, пара, м"
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                name="allowsFraction"
                defaultChecked={record?.allowsFraction}
              />
              Дозволити дробову кількість (до 3 знаків)
            </label>
            <p className="muted">Для штук і пар залиште лише цілі кількості.</p>
          </>
        ) : null}
        {kind === 'warehouses' ? (
          <label>
            Адреса
            <textarea
              name="address"
              defaultValue={record?.address || ''}
              maxLength={500}
            />
          </label>
        ) : null}
        {kind === 'suppliers' ? (
          <>
            <label>
              Електронна пошта
              <input
                name="email"
                type="email"
                defaultValue={record?.email || ''}
                maxLength={254}
              />
            </label>
            <label>
              Телефон
              <input
                name="phone"
                type="tel"
                defaultValue={record?.phone || ''}
                maxLength={60}
              />
            </label>
          </>
        ) : null}
        {kind === 'attributes' ? (
          <>
            <label>
              Тип значень
              <select
                name="kind"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {type === 'NUMBER' ? (
              <label>
                Одиниця вимірювання
                <input
                  name="measurementSymbol"
                  defaultValue={record?.measurementSymbol || ''}
                  maxLength={20}
                  placeholder="мм, см"
                />
              </label>
            ) : null}
            <p className="muted">
              Після створення додайте допустимі значення. Тип і одиниця
              фіксуються після додавання першого значення.
            </p>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="error-message">
            {error}
          </p>
        ) : null}
        <button className="primary" disabled={pending}>
          {pending ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </form>
    </section>
  );
}
