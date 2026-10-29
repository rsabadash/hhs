export default function Loading() {
  return (
    <main id="main" className="shop-main" aria-busy="true">
      <p role="status">Завантажуємо каталог…</p>
      <p>Перший запит після перерви може тривати близько хвилини.</p>
    </main>
  );
}
