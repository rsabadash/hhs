import { ServiceLoading } from '@/components/service-recovery';
export default function Loading() {
  return (
    <main id="main" className="shop-main" aria-busy="true">
      <ServiceLoading />
    </main>
  );
}
