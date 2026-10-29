import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { sections } from '@/lib/references';
import { inventorySections } from '@/lib/inventory';
import Logout from '../logout';
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await adminApi<{ email: string }>('auth/me');
  return (
    <>
      <header className="admin-header">
        <Link className="brand" href="/">
          HHS<span>адміністрування</span>
        </Link>
        <div className="admin-account">
          <span>{admin.email}</span>
          <Logout />
        </div>
      </header>
      <div className="admin-workspace">
        <nav className="admin-nav" aria-label="Адміністрування">
          <p className="eyebrow">Товари</p>
          <Link href="/admin/categories">{sections.categories}</Link>
          <Link href="/admin/attributes">{sections.attributes}</Link>
          <Link href="/admin/products">Товари</Link>
          <p className="eyebrow">Склад</p>
          <Link href="/admin/suppliers">{sections.suppliers}</Link>
          <Link href="/admin/warehouses">{sections.warehouses}</Link>
          <Link href="/admin/units">{sections.units}</Link>
          {Object.entries(inventorySections).map(([key, label]) => (
            <Link key={key} href={`/admin/inventory/${key}`}>
              {label}
            </Link>
          ))}
          <p className="eyebrow">Магазин</p>
          <Link href="/admin/orders">Замовлення</Link>
        </nav>
        <main id="main" className="admin-main">
          {children}
        </main>
      </div>
    </>
  );
}
