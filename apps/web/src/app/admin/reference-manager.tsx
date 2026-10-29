'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  sections,
  type Reference,
  type ReferenceKind,
  type ReferenceList,
} from '@/lib/references';
import ReferenceForm from './reference-form';
import AttributeForm from './attribute-form';
import ReferenceFilters from './reference-filters';

function description(kind: ReferenceKind, item: Reference) {
  if (kind === 'categories') return item.parent?.name || 'Коренева категорія';
  if (kind === 'attributes') return `Значень: ${item._count?.values || 0}`;
  if (kind === 'units')
    return `${item.symbol} · ${item.allowsFraction ? 'Дробова кількість' : 'Ціла кількість'}`;
  if (kind === 'warehouses') return item.address || 'Адресу не вказано';
  if (kind === 'suppliers')
    return (
      [item.email, item.phone].filter(Boolean).join(' · ') ||
      'Контакти не вказано'
    );
  return item.numericValue !== null && item.numericValue !== undefined
    ? 'Числове значення'
    : 'Текстове значення';
}
export default function ReferenceManager({
  kind,
  list,
  query,
  attribute,
  parent,
}: {
  kind: ReferenceKind;
  list: ReferenceList;
  query: string;
  attribute: Reference | null;
  parent: Reference | null;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Reference | 'new' | null>(null);
  const [saved, setSaved] = useState(false);
  const current = new URLSearchParams(query);
  const href = (changes: Record<string, string>) => {
    const p = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    return `/admin/${kind}?${p}`;
  };
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Керування даними</p>
          <h1>{sections[kind]}</h1>
          {attribute ? (
            <p className="muted">{attribute.name}</p>
          ) : (
            <p className="muted">
              {kind === 'categories'
                ? 'Структура каталогу та вкладені категорії.'
                : 'Створюйте й оновлюйте записи для роботи з каталогом.'}
            </p>
          )}
        </div>
        <button
          className="primary"
          onClick={() => {
            setSaved(false);
            setEditor('new');
          }}
        >
          Додати запис
        </button>
      </div>
      {kind === 'attribute-values' ? (
        <Link className="back-link" href="/admin/attributes">
          ← Усі атрибути
        </Link>
      ) : null}
      <ReferenceFilters
        kind={kind}
        query={query}
        parent={parent}
        total={list.total}
      />
      {saved ? (
        <p role="status" className="feedback">
          Запис збережено.
        </p>
      ) : null}
      {editor && kind === 'attributes' ? (
        <AttributeForm
          key={editor === 'new' ? 'new' : editor.id}
          record={editor === 'new' ? undefined : editor}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setSaved(true);
            router.refresh();
          }}
        />
      ) : editor ? (
        <ReferenceForm
          key={editor === 'new' ? 'new' : editor.id}
          kind={kind}
          record={editor === 'new' ? undefined : editor}
          attribute={attribute}
          parent={parent}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setSaved(true);
            router.refresh();
          }}
        />
      ) : null}
      <div className="list-heading">
        <h2>{parent ? `Підкатегорії: ${parent.name}` : 'Записи'}</h2>
      </div>
      {list.items.length ? (
        <ul className="reference-list">
          {list.items.map((item) => (
            <li key={item.id}>
              <div>
                <h3>{item.name || item.label}</h3>
                <p>{description(kind, item)}</p>
              </div>
              <div className="row-actions">
                {kind === 'categories' ? (
                  <Link href={href({ parentId: item.id, page: '1', q: '' })}>
                    Підкатегорії ({item._count?.children || 0})
                  </Link>
                ) : null}
                {kind === 'attributes' ? (
                  <button
                    onClick={() => {
                      setSaved(false);
                      setEditor(item);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Значення ({item._count?.values || 0})
                  </button>
                ) : null}
                <button
                  aria-label={`Редагувати ${item.name || item.label}`}
                  onClick={() => {
                    setSaved(false);
                    setEditor(item);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Редагувати
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <h3>
            {current.get('q') ? 'Нічого не знайдено' : 'Тут поки немає записів'}
          </h3>
          <p>Додайте запис або змініть пошук і фільтри.</p>
        </div>
      )}
      <nav className="pagination" aria-label="Сторінки списку">
        {list.page > 1 ? (
          <Link href={href({ page: String(list.page - 1) })}>← Попередня</Link>
        ) : (
          <span />
        )}
        <span>
          Сторінка {list.page} з {pageCount}
        </span>
        {list.page < pageCount ? (
          <Link href={href({ page: String(list.page + 1) })}>Наступна →</Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
