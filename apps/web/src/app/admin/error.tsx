'use client';
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="login-page">
      <h1>Дані поки недоступні</h1>
      <p>Сервіс може прокидатися після перерви. Повторіть спробу за хвилину.</p>
      <button onClick={reset}>Спробувати знову</button>
    </main>
  );
}
