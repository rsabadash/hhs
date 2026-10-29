'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="welcome">
      <h1>Не вдалося завантажити сторінку</h1>
      <button onClick={reset}>Спробувати ще раз</button>
    </main>
  );
}
