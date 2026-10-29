'use client';
import { ServiceRecovery } from '@/components/service-recovery';
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="shop-main">
      <ServiceRecovery retry={retry} />
    </main>
  );
}
