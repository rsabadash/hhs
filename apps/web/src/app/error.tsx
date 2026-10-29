'use client';
import { ServiceRecovery } from '@/components/service-recovery';
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="welcome">
      <ServiceRecovery retry={retry} />
    </main>
  );
}
