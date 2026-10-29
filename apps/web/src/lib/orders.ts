import type { Selection } from './catalog';
export const orderStatuses = {
  CONFIRMED: 'Підтверджено',
  FULFILLED: 'Виконано',
  CANCELLED: 'Скасовано',
} as const;
export type OrderLine = {
  variantId: string;
  sku: string;
  name: string;
  unitSymbol: string;
  quantity: string;
  unitPrice: string;
  total: string;
  available?: string;
  remaining?: string;
};
export type OrderPreview = {
  warehouse: Selection;
  items: OrderLine[];
  total: string;
};
export type OrderDocument = OrderPreview & {
  id: string;
  reference: string;
  customerName: string;
  contact: string;
  notes: string;
  status: keyof typeof orderStatuses;
  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  createdBy: { email: string };
  fulfilledBy: { email: string } | null;
  cancelledBy: { email: string } | null;
};
export type OrderRequest = {
  requestKey: string;
  warehouseId: string;
  customerName: string;
  contact: string;
  notes: string;
  items: { variantId: string; quantity: string; unitPrice: string }[];
};
