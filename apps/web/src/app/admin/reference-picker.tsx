'use client';
import { useEffect, useState } from 'react';
import type { Selection } from '@/lib/catalog';
export default function ReferencePicker({
  kind,
  label,
  value,
  onChange,
  attributeId,
  initialLabel = '',
}: {
  kind: string;
  label: string;
  value: string;
  onChange: (item: Selection | null) => void;
  attributeId?: string;
  initialLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Selection[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(initialLabel);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const query = new URLSearchParams({
          q,
          page: String(page),
          pageSize: '10',
          ...(attributeId ? { attributeId } : {}),
        });
        const r = await fetch(`/api/admin/references/${kind}?${query}`, {
          signal: controller.signal,
        });
        if (!r.ok)
          throw Error(
            r.status === 401
              ? 'Сеанс завершено. Увійдіть знову.'
              : 'Не вдалося завантажити список.',
          );
        const data = await r.json();
        setItems(data.items);
        setTotal(data.total);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, page, kind, attributeId, open]);
  return (
    <div className="catalog-picker" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {value ? chosen || initialLabel || 'Вибрано' : 'Вибрати…'}
      </button>
      {open && (
        <div className="picker-panel">
          <input
            aria-label={`Пошук: ${label}`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Пошук…"
          />
          {error && <p role="alert">{error}</p>}
          {busy && <p role="status">Завантаження…</p>}
          {!busy && !error && items.length === 0 && <p>Нічого не знайдено.</p>}
          <div className="picker-options">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={busy}
                onClick={() => {
                  setChosen(item.name || item.label || '');
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item.name || item.label}
                {item.symbol ? ` (${item.symbol})` : ''}
              </button>
            ))}
          </div>
          <div className="catalog-actions">
            <button
              type="button"
              disabled={page === 1 || busy}
              onClick={() => setPage(page - 1)}
            >
              Назад
            </button>
            <span>{page}</span>
            <button
              type="button"
              disabled={page * 10 >= total || busy}
              onClick={() => setPage(page + 1)}
            >
              Далі
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setChosen('');
                setOpen(false);
              }}
            >
              Очистити
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
