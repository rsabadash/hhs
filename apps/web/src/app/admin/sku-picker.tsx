'use client';
import { useEffect, useState } from 'react';
import {
  attributesLabel,
  variantLabel,
  type StockVariant,
  type InventoryList,
} from '@/lib/inventory';
export default function SkuPicker({
  onSelect,
  includeArchived = false,
}: {
  onSelect: (v: StockVariant) => void;
  includeArchived?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [data, setData] = useState<InventoryList<StockVariant>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const r = await fetch(
          `/api/admin/inventory/variants?${new URLSearchParams({ q, page: String(page), pageSize: '10', sort: 'asc', archived: includeArchived ? 'all' : 'false' })}`,
          { signal: controller.signal },
        );
        if (!r.ok)
          throw Error(
            'Не вдалося завантажити SKU. Перевірте сеанс і повторіть.',
          );
        const result = await r.json();
        if (!controller.signal.aborted) setData(result);
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
  }, [open, q, page, includeArchived]);
  return (
    <div className="catalog-picker">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Додати SKU
      </button>
      {open && (
        <div className="picker-panel">
          <input
            aria-label="Пошук SKU"
            placeholder="Назва товару або SKU"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {error && <p role="alert">{error}</p>}
          {busy && <p role="status">Завантаження…</p>}
          {!busy && !error && !data.items.length && <p>SKU не знайдено.</p>}
          <div className="picker-options">
            {data.items.map((v) => (
              <button
                type="button"
                disabled={busy}
                key={v.id}
                onClick={() => {
                  onSelect(v);
                  setOpen(false);
                }}
              >
                {variantLabel(v)}
                <small>{attributesLabel(v)}</small>
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
              disabled={page * 10 >= data.total || busy}
              onClick={() => setPage(page + 1)}
            >
              Далі
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
