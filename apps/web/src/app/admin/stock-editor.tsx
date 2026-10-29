'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { writeAdmin } from '@/lib/references';
import {
  attributesLabel,
  lineCost,
  quantityDifference,
  moneyFromCents,
  statuses,
  stockDate,
  variantLabel,
  type StockDocument,
  type StockLine,
} from '@/lib/inventory';
import ReferencePicker from './reference-picker';
import SkuPicker from './sku-picker';
export default function StockEditor({
  kind,
  initial,
}: {
  kind: 'supplies' | 'counts';
  initial: StockDocument | null;
}) {
  const router = useRouter();
  const supply = kind === 'supplies';
  const [doc, setDoc] = useState(initial),
    [reference, setReference] = useState(initial?.reference || ''),
    [warehouse, setWarehouse] = useState(initial?.warehouse || null),
    [supplier, setSupplier] = useState(initial?.supplier || null),
    [notes, setNotes] = useState(initial?.notes || ''),
    [items, setItems] = useState<StockLine[]>(initial?.items || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [dirty, setDirty] = useState(false);
  const draft = !doc || doc.status === 'DRAFT';
  const counting = doc?.status === 'COUNTING';
  const editLine = (id: string, patch: Partial<StockLine>) => {
    setDirty(true);
    setItems((rows) =>
      rows.map((i) => (i.variantId === id ? { ...i, ...patch } : i)),
    );
  };
  async function perform(action: string) {
    if (
      action &&
      action !== 'results' &&
      action !== 'recount' &&
      !window.confirm(
        action === 'receive'
          ? 'Отримати всі рядки? Залишки збільшаться, редагування буде закрито.'
          : action === 'post'
            ? 'Провести переглянуті розбіжності? Це змінить залишки.'
            : action === 'cancel'
              ? 'Скасувати інвентаризацію без зміни залишків?'
              : 'Зафіксувати залишки й почати підрахунок?',
      )
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    let navigating = false;
    try {
      const body =
        action === 'results'
          ? {
              revision: doc!.revision,
              items: items.map((i) => ({
                variantId: i.variantId,
                actualQuantity: i.actualQuantity,
                reason: i.reason,
                excluded: i.excluded,
              })),
            }
          : action
            ? { revision: doc!.revision }
            : {
                reference,
                warehouseId: warehouse?.id,
                supplierId: supply ? supplier?.id : undefined,
                notes,
                revision: doc?.revision,
                items: items.map((i) =>
                  supply
                    ? {
                        variantId: i.variantId,
                        quantity: i.quantity,
                        unitCost: i.unitCost,
                      }
                    : { variantId: i.variantId },
                ),
              };
      const saved: StockDocument = await writeAdmin(
        `inventory/${kind}${doc ? `/${doc.id}` : ''}${action ? `/${action}` : ''}`,
        action === 'results' || (!action && doc) ? 'PUT' : 'POST',
        body,
      );
      setDoc(saved);
      setItems(saved.items);
      setDirty(false);
      setMessage('Збережено.');
      if (!doc) {
        navigating = true;
        router.replace(`/admin/inventory/${kind}/${saved.id}`);
      }
      // The mutation returns the complete authoritative document. A concurrent
      // router refresh could remount this editor with an older revision while
      // the next save is pending, resetting busy/dirty state.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!navigating) setBusy(false);
    }
  }
  async function recount(variantId: string) {
    if (
      !window.confirm(
        'Оновити очікуваний залишок? Попередню фактичну кількість буде очищено: перерахуйте SKU заново.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const saved: StockDocument = await writeAdmin(
        `inventory/counts/${doc!.id}/recount`,
        'POST',
        { revision: doc!.revision, variantId },
      );
      setDoc(saved);
      setItems(saved.items);
      setDirty(false);
      setMessage(
        'Знімок оновлено. Перерахуйте SKU й введіть нову фактичну кількість.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const cents = items.reduce(
    (sum, i) => sum + lineCost(i.quantity, i.unitCost),
    0n,
  );
  return (
    <section className="catalog-page">
      <Link href={`/admin/inventory/${kind}`}>
        ← {supply ? 'Постачання' : 'Інвентаризація'}
      </Link>
      <h1>
        {doc
          ? doc.reference
          : supply
            ? 'Нове постачання'
            : 'Нова інвентаризація'}
      </h1>
      <p className="status-pill">{statuses[doc?.status || 'DRAFT']}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform(counting ? 'results' : '');
        }}
      >
        <fieldset disabled={busy} className="stock-fieldset">
          <div className="catalog-card">
            <div className="catalog-grid">
              <label>
                Номер документа
                <input
                  required
                  maxLength={80}
                  value={reference}
                  disabled={!draft}
                  onChange={(e) => {
                    setReference(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              {draft ? (
                <>
                  <ReferencePicker
                    kind="warehouses"
                    label="Склад"
                    value={warehouse?.id || ''}
                    initialLabel={warehouse?.name}
                    onChange={(v) => {
                      setWarehouse(v);
                      setDirty(true);
                    }}
                  />
                  {supply && (
                    <ReferencePicker
                      kind="suppliers"
                      label="Постачальник"
                      value={supplier?.id || ''}
                      initialLabel={supplier?.name}
                      onChange={(v) => {
                        setSupplier(v);
                        setDirty(true);
                      }}
                    />
                  )}
                </>
              ) : (
                <>
                  <p>Склад: {warehouse?.name}</p>
                  {supply && <p>Постачальник: {supplier?.name}</p>}
                </>
              )}
            </div>
            <label>
              Примітки
              <textarea
                maxLength={2000}
                disabled={!draft}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </div>
          {!supply && (
            <p>
              Підрахуйте вибрані SKU на одному складі. Порожнє поле означає «не
              підраховано»; введіть 0 для відсутнього товару. Для розбіжностей
              потрібна причина.
            </p>
          )}
          {items.map((i, index) => (
            <article className="catalog-card stock-line" key={i.variantId}>
              <h2>
                {index + 1}. {variantLabel(i.variant)}
              </h2>
              <p className="muted">{attributesLabel(i.variant)}</p>
              {supply ? (
                <div className="catalog-grid">
                  <label>
                    Кількість ({i.unitSymbol || i.variant.unit.symbol})
                    <input
                      aria-label={`Кількість ${i.variant.sku}`}
                      required
                      inputMode="decimal"
                      value={i.quantity}
                      disabled={!draft}
                      onChange={(e) =>
                        editLine(i.variantId, { quantity: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Закупівельна ціна за одиницю, грн
                    <input
                      aria-label={`Ціна ${i.variant.sku}`}
                      required
                      inputMode="decimal"
                      value={i.unitCost}
                      disabled={!draft}
                      onChange={(e) =>
                        editLine(i.variantId, { unitCost: e.target.value })
                      }
                    />
                  </label>
                  <p>
                    Сума: {moneyFromCents(lineCost(i.quantity, i.unitCost))} грн
                  </p>
                </div>
              ) : (
                !draft && (
                  <>
                    <div className="catalog-grid">
                      <p>
                        Очікувана кількість:{' '}
                        <strong>{i.expectedQuantity}</strong>{' '}
                        {i.variant.unit.symbol}
                      </p>
                      <label>
                        Фактична кількість
                        <input
                          aria-label={`Фактична кількість ${i.variant.sku}`}
                          inputMode="decimal"
                          disabled={!counting || i.excluded}
                          value={i.actualQuantity ?? ''}
                          onChange={(e) =>
                            editLine(i.variantId, {
                              actualQuantity:
                                e.target.value === '' ? null : e.target.value,
                            })
                          }
                        />
                      </label>
                      <p>
                        Різниця:{' '}
                        {i.excluded
                          ? 'Виключено'
                          : i.actualQuantity === null
                            ? 'Не підраховано'
                            : quantityDifference(
                                i.actualQuantity,
                                i.expectedQuantity,
                              )}
                      </p>
                    </div>
                    <label>
                      Причина розбіжності
                      <input
                        aria-label={`Причина ${i.variant.sku}`}
                        maxLength={500}
                        disabled={!counting}
                        value={i.reason}
                        onChange={(e) =>
                          editLine(i.variantId, { reason: e.target.value })
                        }
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={i.excluded}
                        disabled={!counting}
                        onChange={(e) =>
                          editLine(i.variantId, { excluded: e.target.checked })
                        }
                      />
                      Виключити цей SKU з підрахунку
                    </label>
                    {i.stale && (
                      <p role="alert">
                        Залишок змінився після початку підрахунку.
                      </p>
                    )}
                    {counting && (
                      <button
                        type="button"
                        disabled={dirty}
                        onClick={() => void recount(i.variantId)}
                      >
                        Оновити знімок і перерахувати {i.variant.sku}
                      </button>
                    )}
                  </>
                )
              )}
              {draft && (
                <button
                  type="button"
                  onClick={() => {
                    setItems((rows) =>
                      rows.filter((r) => r.variantId !== i.variantId),
                    );
                    setDirty(true);
                  }}
                >
                  Видалити рядок {index + 1}
                </button>
              )}
            </article>
          ))}
          {draft && (
            <SkuPicker
              includeArchived={!supply}
              onSelect={(v) => {
                if (items.some((i) => i.variantId === v.id)) {
                  setError('Цей SKU уже додано.');
                  return;
                }
                if (items.length >= 100) {
                  setError('Максимум 100 SKU в документі.');
                  return;
                }
                setItems((rows) => [
                  ...rows,
                  {
                    variantId: v.id,
                    variant: v,
                    quantity: '1',
                    unitCost: '0',
                    expectedQuantity: '0',
                    actualQuantity: null,
                    reason: '',
                    excluded: false,
                    difference: null,
                  },
                ]);
                setDirty(true);
                setError('');
              }}
            />
          )}
          {supply && (
            <p className="stock-total">Разом: {moneyFromCents(cents)} грн</p>
          )}
          <div className="catalog-actions">
            {(draft || counting) && (
              <button
                className="primary"
                type="submit"
                disabled={!items.length}
              >
                {busy
                  ? 'Збереження…'
                  : counting
                    ? 'Зберегти підрахунок'
                    : 'Зберегти чернетку'}
              </button>
            )}
            {doc && draft && (
              <button
                type="button"
                disabled={dirty}
                onClick={() => void perform(supply ? 'receive' : 'start')}
              >
                {supply ? 'Отримати постачання' : 'Почати підрахунок'}
              </button>
            )}
            {counting && (
              <button
                type="button"
                disabled={dirty}
                onClick={() => void perform('post')}
              >
                Провести інвентаризацію
              </button>
            )}
            {!supply && doc && (draft || counting) && (
              <button
                type="button"
                disabled={dirty}
                onClick={() => void perform('cancel')}
              >
                Скасувати інвентаризацію
              </button>
            )}
          </div>
          {dirty && (
            <p className="muted">
              Збережіть зміни перед переходом до наступного стану.
            </p>
          )}
        </fieldset>
      </form>
      {doc && (
        <div className="catalog-card">
          <h2>Історія документа</h2>
          <p>
            Створено: {stockDate(doc.createdAt)} · {doc.createdBy?.email}
          </p>
          {doc.receivedAt && (
            <p>
              Отримано: {stockDate(doc.receivedAt)} · {doc.receivedBy?.email}
            </p>
          )}
          {doc.startedAt && (
            <p>
              Початок: {stockDate(doc.startedAt)} · {doc.startedBy?.email}
            </p>
          )}
          {doc.postedAt && (
            <p>
              Проведено: {stockDate(doc.postedAt)} · {doc.postedBy?.email}
            </p>
          )}
          {doc.cancelledAt && (
            <p>
              Скасовано: {stockDate(doc.cancelledAt)} · {doc.cancelledBy?.email}
            </p>
          )}
          <Link
            href={`/admin/inventory/movements?q=${encodeURIComponent(doc.reference)}`}
          >
            Пов’язані рухи запасів
          </Link>
        </div>
      )}
    </section>
  );
}
