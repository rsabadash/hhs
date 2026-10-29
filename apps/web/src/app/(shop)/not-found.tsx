import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="shop-main">
      <h1>Товар не знайдено</h1>
      <p>Можливо, його знято з публікації.</p>
      <Link href="/">Повернутися до каталогу</Link>
    </main>
  );
}
