import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="welcome">
      <h1>Сторінку не знайдено</h1>
      <Link href="/">На головну</Link>
    </main>
  );
}
