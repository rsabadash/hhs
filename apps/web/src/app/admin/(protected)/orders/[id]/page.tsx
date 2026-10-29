import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import type { OrderDocument } from '@/lib/orders';
import OrderDetail from '../../../order-detail';
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  return (
    <OrderDetail initial={await adminApi<OrderDocument>(`orders/${id}`)} />
  );
}
