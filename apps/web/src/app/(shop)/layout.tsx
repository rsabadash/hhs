import Link from 'next/link';
import './shop.css';
export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="shop">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="HHS — головна">
          HHS<span>матеріали для прикрас</span>
        </Link>
        <Link href="/">Каталог</Link>
      </header>
      {children}
      <footer>
        HHS · Матеріали для прикрас · Україна{' '}
        <Link href="/admin">Для адміністратора</Link>
      </footer>
    </div>
  );
}
