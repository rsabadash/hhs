'use client';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { filterValues, listQuery } from '@/lib/list-query';

type Props = {
  action: string;
  query: string;
  searchLabel?: string;
  placeholder?: string;
  resultLabel: string;
  filterKeys: string[];
  filterDefaults?: Record<string, string>;
  defaultSort?: string;
  sortOptions?: { value: string; label: string }[];
  children?: ReactNode;
};
const nameSort = [
  { value: 'asc', label: 'Назва: А → Я' },
  { value: 'desc', label: 'Назва: Я → А' },
];
export default function ListControls({
  action,
  query,
  searchLabel = 'Пошук',
  placeholder = 'Назва або позначення',
  resultLabel,
  filterKeys,
  filterDefaults = {},
  defaultSort = 'asc',
  sortOptions = nameSort,
  children,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const params = new URLSearchParams(query);
  const [search, setSearch] = useState(params.get('q') || '');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const count = filterKeys.filter(
    (key) =>
      params.has(key) &&
      params.get(key) !== '' &&
      params.get(key) !== filterDefaults[key],
  ).length;
  useEffect(() => {
    if (!open) return;
    const el = dialog.current!;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    el.showModal();
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);
  function navigate(next: string) {
    setOpen(false);
    startTransition(() =>
      router.push(`${action}${next ? `?${next}` : ''}`, { scroll: false }),
    );
  }
  return (
    <div className="list-controls" aria-busy={pending}>
      <form
        className="list-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(listQuery(query, { q: search }));
        }}
      >
        <label>
          <span className="list-sr-only">{searchLabel}</span>
          <input
            type="search"
            name="q"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
          />
        </label>
        <button type="submit" className="list-primary" disabled={pending}>
          Знайти
        </button>
      </form>
      <div className="list-toolbar">
        <p className="list-result-count" role="status">
          {pending ? 'Завантаження…' : resultLabel}
        </p>
        <div className="list-toolbar-actions">
          <label className="list-sort">
            <span>Сортування</span>
            <select
              aria-label="Сортування"
              value={params.get('sort') || defaultSort}
              disabled={pending}
              onChange={(e) =>
                navigate(listQuery(query, { sort: e.target.value }))
              }
            >
              {sortOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {filterKeys.length > 0 && (
            <button
              ref={trigger}
              className="list-filter-trigger"
              type="button"
              disabled={pending}
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              Фільтри
              {count > 0 && (
                <span
                  className="list-filter-count"
                  aria-label={`Активних фільтрів: ${count}`}
                >
                  {count}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
      <dialog
        ref={dialog}
        className="filter-dialog"
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]',
            ),
          ).filter((el) => el.getClientRects().length > 0);
          const first = controls[0];
          const last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            setOpen(false);
        }}
      >
        {open && (
          <form
            className="filter-drawer-form"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(
                listQuery(
                  query,
                  { ...filterValues(new FormData(e.currentTarget)), q: search },
                  filterKeys,
                ),
              );
            }}
          >
            <header className="filter-drawer-header">
              <h2 id={titleId}>Фільтри</h2>
              <button
                type="button"
                aria-label="Закрити фільтри"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="filter-drawer-fields">{children}</div>
            <footer className="filter-drawer-footer">
              <button
                type="button"
                onClick={() =>
                  navigate(listQuery(query, { q: search }, filterKeys))
                }
              >
                Скинути фільтри
              </button>
              <button type="submit" className="list-primary">
                Застосувати
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </div>
  );
}
