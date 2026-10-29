import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { sections } from '@/lib/references';
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
        <nav className="admin-nav" aria-label="Довідники">
          <p className="eyebrow">Довідники</p>
          {Object.entries(sections)
            .filter(([key]) => key !== 'attribute-values')
            .map(([key, label]) => (
              <Link key={key} href={`/admin/${key}`}>
                {label}
              </Link>
            ))}
        </nav>
        <main id="main" className="admin-main">
          {children}
        </main>
      </div>
    </>
  );
}
