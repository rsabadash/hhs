'use client';

import { useEffect, useRef, useState } from 'react';
import { writeAdmin, type Reference } from '@/lib/references';

type Value = { key: string; id?: string; label: string; used?: boolean };
type AttributeDetails = Reference & {
  values: {
    id: string;
    label: string;
    _count: { products: number; variants: number };
  }[];
};

export default function AttributeForm({
  record,
  onSaved,
  onCancel,
}: {
  record?: Reference;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(record?.name || '');
  const [values, setValues] = useState<Value[]>(
    record ? [] : [{ key: 'new-0', label: '' }],
  );
  const nextKey = useRef(1);
  const [removedValueIds, setRemovedValueIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(record));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/admin/references/attributes/${record!.id}`,
          {
            cache: 'no-store',
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15000),
            ]),
          },
        );
        if (!response.ok) throw new Error();
        const attribute: AttributeDetails = await response.json();
        if (controller.signal.aborted) return;
        setName(attribute.name || '');
        setValues(
          attribute.values.map((value) => ({
            key: value.id,
            id: value.id,
            label: [value.label, attribute.measurementSymbol]
              .filter(Boolean)
              .join(' '),
            used: value._count.products + value._count.variants > 0,
          })),
        );
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setLoadError('Не вдалося завантажити значення. Спробуйте ще раз.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [record, loadAttempt]);

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
      {loading ? (
        <p role="status">Завантажуємо значення…</p>
      ) : loadError ? (
        <div>
          <p role="alert">{loadError}</p>
          <button
            onClick={() => {
              setLoading(true);
              setLoadError('');
              setLoadAttempt((n) => n + 1);
            }}
          >
            Спробувати ще раз
          </button>
        </div>
      ) : (
        <form
          className="admin-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            const labels = values.map((value) =>
              value.label.trim().toLocaleLowerCase('uk'),
            );
            if (new Set(labels).size !== labels.length) {
              setError('Значення не повинні повторюватися.');
              return;
            }
            setPending(true);
            try {
              await writeAdmin(
                `references/attributes${record ? `/${record.id}` : ''}`,
                record ? 'PUT' : 'POST',
                {
                  name: name.trim(),
                  values: values.map(({ id, label }) => ({
                    ...(id ? { id } : {}),
                    label: label.trim(),
                  })),
                  removedValueIds,
                },
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
          <fieldset className="stock-fieldset" disabled={pending}>
            <label>
              Назва
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={160}
                autoFocus
              />
            </label>
            <fieldset className="attribute-values-editor">
              <legend>Значення атрибута</legend>
              <p className="muted">
                Наприклад: 4 мм, 6 мм, 8 мм. Додайте кожне значення окремим
                рядком.
              </p>
              {values.map((value, index) => (
                <div className="attribute-value-row" key={value.key}>
                  <label>
                    Значення {index + 1}
                    <input
                      value={value.label}
                      required
                      maxLength={160}
                      readOnly={value.used}
                      onChange={(e) =>
                        setValues((old) =>
                          old.map((item) =>
                            item.key === value.key
                              ? { ...item, label: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    {value.used ? (
                      <small>Використовується в товарі або варіанті.</small>
                    ) : null}
                  </label>
                  <button
                    type="button"
                    disabled={value.used}
                    aria-label={`Прибрати значення ${index + 1}`}
                    onClick={() => {
                      if (value.id)
                        setRemovedValueIds((old) => [...old, value.id!]);
                      setValues((old) =>
                        old.filter((item) => item.key !== value.key),
                      );
                    }}
                  >
                    Прибрати
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={values.length >= 1000}
                onClick={() =>
                  setValues((old) => [
                    ...old,
                    { key: `new-${nextKey.current++}`, label: '' },
                  ])
                }
              >
                Додати значення
              </button>
            </fieldset>
            {error ? (
              <p role="alert" className="error-message">
                {error}
              </p>
            ) : null}
            <button className="primary">
              {pending ? 'Зберігаємо…' : 'Зберегти'}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
