'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Selection } from '@/lib/catalog';
import {
  variantLabel,
  attributesLabel,
  type StockVariant,
} from '@/lib/inventory';
import type { OrderPreview, OrderRequest } from '@/lib/orders';
import { writeAdmin } from '@/lib/references';
import ReferencePicker from './reference-picker';
import SkuPicker from './sku-picker';
import OrderLines from './order-lines';
export default function OrderEditor() {
  const router = useRouter();
  const [warehouse, setWarehouse] = useState<Selection | null>(null),
    [customerName, setName] = useState(''),
    [contact, setContact] = useState(''),
    [notes, setNotes] = useState('');
  const [items, setItems] = useState<
    { variant: StockVariant; quantity: string }[]
  >([]);
  const [review, setReview] = useState<{
      data: OrderPreview;
      body: OrderRequest;
    } | null>(null),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function preview(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const draft = {
        warehouseId: warehouse?.id,
        customerName,
        contact,
        notes,
        items: items.map((i) => ({
          variantId: i.variant.id,
          quantity: i.quantity,
        })),
      };
      const data: OrderPreview = await writeAdmin(
        'orders/preview',
        'POST',
        draft,
      );
      setReview({
        data,
        body: {
          ...draft,
          warehouseId: data.warehouse.id,
          requestKey: crypto.randomUUID(),
          items: data.items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!review || busy) return;
    setBusy(true);
    setAttempted(true);
    setError('');
    try {
      const doc = await writeAdmin('orders', 'POST', review.body);
      router.replace(`/admin/orders/${doc.id}`);
    } catch (e) {
      // A network/5xx failure may follow a committed transaction. Keep the exact
      // payload and request key for a safe retry; only definite 4xx allows edits.
      const status = (e as Error & { status?: number }).status;
      if (status && status >= 400 && status < 500) setAttempted(false);
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page order-page">
      <Link href="/admin/orders">← Замовлення</Link>
      <h1>Нове замовлення</h1>
      <p>
        Один склад на замовлення. Збереження одразу зменшує залишки. Позиції та
        ціни після цього не редагуються.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Обробка…</p>}
      {!review ? (
        <form onSubmit={preview}>
          <fieldset disabled={busy} className="order-fieldset">
            <div className="catalog-card catalog-grid">
              <ReferencePicker
                kind="warehouses"
                label="Склад"
                value={warehouse?.id || ''}
                initialLabel={warehouse?.name}
                onChange={setWarehouse}
              />
              <label>
                Покупець
                <input
                  required
                  maxLength={160}
                  value={customerName}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Instagram або контакт
                <input
                  required
                  maxLength={250}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="@username або телефон"
                />
              </label>
              <label>
                Примітка
                <textarea
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            <h2>Позиції</h2>
            <p>
              Оберіть SKU. Поточні ціни та залишки буде перевірено перед
              збереженням.
            </p>
            {items.map((i) => (
              <article className="catalog-card" key={i.variant.id}>
                <h3>{variantLabel(i.variant)}</h3>
                <p>{attributesLabel(i.variant)}</p>
                <label>
                  Кількість · {i.variant.sku}
                  <input
                    required
                    inputMode="decimal"
                    value={i.quantity}
                    onChange={(e) =>
                      setItems((rows) =>
                        rows.map((row) =>
                          row.variant.id === i.variant.id
                            ? {
                                ...row,
                                quantity: e.target.value.replace(',', '.'),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setItems((rows) =>
                      rows.filter((row) => row.variant.id !== i.variant.id),
                    )
                  }
                >
                  Видалити {i.variant.sku}
                </button>
              </article>
            ))}
            {items.length < 100 && (
              <SkuPicker
                onSelect={(v) =>
                  setItems((rows) =>
                    rows.some((i) => i.variant.id === v.id)
                      ? rows
                      : [...rows, { variant: v, quantity: '1' }],
                  )
                }
              />
            )}
            <button
              className="primary"
              type="submit"
              disabled={!warehouse || !items.length}
            >
              Перевірити замовлення
            </button>
          </fieldset>
        </form>
      ) : (
        <section aria-label="Перевірка замовлення">
          <h2>Перевірте перед збереженням</h2>
          <p>
            {review.data.warehouse.name} · {review.body.customerName} ·{' '}
            {review.body.contact}
          </p>
          {review.body.notes && <p>{review.body.notes}</p>}
          <OrderLines data={review.data} />
          <p>Ціни та залишки буде перевірено повторно під час збереження.</p>
          {attempted && !busy && (
            <p role="status">
              Результат запиту не підтверджено. Повторіть збереження з тим самим
              ключем — подвійного списання не буде.
            </p>
          )}
          <div className="catalog-actions">
            <button
              disabled={busy || attempted}
              onClick={() => {
                setReview(null);
                setError('');
              }}
            >
              Редагувати
            </button>
            <button className="primary" disabled={busy} onClick={create}>
              {attempted ? 'Повторити збереження' : 'Створити й списати запаси'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
