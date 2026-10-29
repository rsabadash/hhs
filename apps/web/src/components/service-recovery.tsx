'use client';

import { useEffect, useState } from 'react';

const retryKey = 'hhs:service-recovery';

export function ServiceRecovery({ retry }: { retry: () => void }) {
  const [state, setState] = useState<
    'starting' | 'delayed' | 'recovering' | 'failed'
  >('starting');

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let wasUnavailable = false;
    const delayed = setTimeout(() => setState('delayed'), 120_000);

    async function check() {
      let ready = false;
      try {
        const response = await fetch('/api/health', {
          cache: 'no-store',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        ready = response.ok && (await response.json()).status === 'ok';
      } catch {
        // Network errors and timeouts are retried just like an unavailable API.
      }
      if (controller.signal.aborted) return;
      if (ready) {
        clearTimeout(delayed);
        // A healthy API can still return a broken page. Allow one automatic
        // refresh, but do not loop if that page fails again after remounting.
        const location = window.location.pathname + window.location.search;
        try {
          const previous = JSON.parse(
            sessionStorage.getItem(retryKey) || 'null',
          );
          if (
            !wasUnavailable &&
            previous?.location === location &&
            Date.now() - previous.time < 60_000
          ) {
            setState('failed');
            return;
          }
          sessionStorage.setItem(
            retryKey,
            JSON.stringify({ location, time: Date.now() }),
          );
        } catch {
          // With browser storage disabled, only auto-retry a confirmed outage.
          if (!wasUnavailable) {
            setState('failed');
            return;
          }
        }
        setState('recovering');
        retry();
        return;
      }
      wasUnavailable = true;
      attempts += 1;
      timer = setTimeout(check, Math.min(3000 * attempts, 15_000));
    }

    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(delayed);
    };
  }, [retry]);

  return (
    <section className="service-status" aria-label="Стан сервісу">
      {state !== 'failed' ? (
        <span className="service-spinner" aria-hidden="true" />
      ) : null}
      <div role="status">
        <h1>
          {state === 'failed'
            ? 'Не вдалося завантажити сторінку'
            : state === 'delayed'
              ? 'Сервіс поки недоступний'
              : state === 'recovering'
                ? 'Завантажуємо сторінку…'
                : 'Запускаємо сервіс…'}
        </h1>
        <p>
          {state === 'failed'
            ? 'Сервіс відповідає, але сторінка не завантажилася. Спробуйте ще раз.'
            : state === 'delayed'
              ? 'Це триває довше, ніж зазвичай. Продовжуємо перевіряти з’єднання — сторінка відкриється автоматично.'
              : state === 'recovering'
                ? 'З’єднання відновлено. Оновлюємо дані.'
                : 'Після перерви запуск може тривати близько хвилини. Сторінка відкриється автоматично — оновлювати її не потрібно.'}
        </p>
      </div>
      {state === 'failed' ? (
        <button onClick={retry}>Спробувати ще раз</button>
      ) : null}
    </section>
  );
}

export function ServiceLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="service-status" role="status">
      <span className="service-spinner" aria-hidden="true" />
      <p>
        {slow
          ? 'Запускаємо сервіс… Сторінка відкриється автоматично, зачекайте.'
          : 'Завантажуємо…'}
      </p>
    </div>
  );
}
