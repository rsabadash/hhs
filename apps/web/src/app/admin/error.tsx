'use client';
import { ServiceRecovery } from '@/components/service-recovery';
export default function AdminError({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="login-page">
      <ServiceRecovery retry={retry} />
    </main>
  );
}
