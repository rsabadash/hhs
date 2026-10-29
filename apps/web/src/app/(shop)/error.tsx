'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="shop-main">
      <h1>Каталог тимчасово недоступний</h1>
      <p>Спробуйте ще раз за хвилину.</p>
      <button onClick={reset}>Спробувати ще раз</button>
    </main>
  );
}
