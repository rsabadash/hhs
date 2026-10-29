'use client';
import Link from 'next/link';
import { useState } from 'react';
import { orderStatuses, type OrderDocument } from '@/lib/orders';
import { stockDate } from '@/lib/inventory';
import { writeAdmin } from '@/lib/references';
import OrderLines from './order-lines';
export default function OrderDetail({ initial }: { initial: OrderDocument }) {
  const [doc, setDoc] = useState(initial),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function finish(action: 'fulfill' | 'cancel') {
    if (
      busy ||
      !window.confirm(
        action === 'cancel'
          ? 'Скасувати замовлення? Усі позиції повернуться на склад.'
          : 'Позначити виконаним? Залишки не зміняться. Скасування буде закрито.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      setDoc(
        await writeAdmin(
          `orders/${doc.id}/${action}`,
          'POST',
          action === 'cancel' ? { reason } : {},
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page order-page">
      <Link href="/admin/orders">← Замовлення</Link>
      <h1 className="order-reference">{doc.reference}</h1>
      <p role="status">{orderStatuses[doc.status]}</p>
      <article className="catalog-card">
        <h2>{doc.customerName}</h2>
        <p>{doc.contact}</p>
        <p>Склад: {doc.warehouse.name}</p>
        {doc.notes && <p>{doc.notes}</p>}
        <p>
          Створено: {stockDate(doc.createdAt)} · {doc.createdBy.email}
        </p>
        {doc.fulfilledAt && (
          <p>
            Виконано: {stockDate(doc.fulfilledAt)} · {doc.fulfilledBy?.email}
          </p>
        )}
        {doc.cancelledAt && (
          <p>
            Скасовано: {stockDate(doc.cancelledAt)} · {doc.cancelledBy?.email}
            <br />
            Причина: {doc.cancellationReason}
          </p>
        )}
      </article>
      <OrderLines data={doc} />
      <Link
        href={`/admin/inventory/movements?q=${encodeURIComponent(doc.reference)}`}
      >
        Рух запасів цього замовлення
      </Link>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Збереження…</p>}
      {doc.status === 'CONFIRMED' && (
        <section className="catalog-card">
          <h2>Завершення замовлення</h2>
          <p>
            Запаси вже списані. Помилкове замовлення можна скасувати й створити
            заново.
          </p>
          <button
            disabled={busy}
            className="primary"
            onClick={() => finish('fulfill')}
          >
            Позначити виконаним
          </button>
          <label>
            Причина скасування
            <textarea
              disabled={busy}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !reason.trim()}
            onClick={() => finish('cancel')}
          >
            Скасувати й повернути запаси
          </button>
        </section>
      )}
    </div>
  );
}
