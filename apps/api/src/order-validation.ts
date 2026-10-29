import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { uuid } from './validation.js';
import { quantity, cost } from './inventory-validation.js';
import { stockDecimal } from './inventory-math.js';
const line = z
  .object({
    variantId: uuid,
    quantity: quantity.refine(
      (v) => Number(v) > 0,
      'Вкажіть додатну кількість.',
    ),
    unitPrice: cost.optional(),
  })
  .strict();
export const orderDraft = z
  .object({
    warehouseId: uuid,
    customerName: z.string().trim().min(1).max(160),
    contact: z.string().trim().min(1).max(250),
    notes: z.string().trim().max(2000).default(''),
    items: z.array(line).min(1).max(100),
  })
  .strict();
export const orderInput = orderDraft
  .extend({ requestKey: uuid })
  .refine(
    (d) => d.items.every((i) => i.unitPrice !== undefined),
    'Перевірте ціни перед створенням замовлення.',
  );
export const cancelInput = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const fulfillInput = z.object({}).strict();
export const orderQuery = z
  .object({
    q: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    warehouseId: uuid.optional(),
    status: z.enum(['CONFIRMED', 'FULFILLED', 'CANCELLED']).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, 'Перевірте діапазон дат.');
// Canonical rows make a reordered/combined retry equivalent to its first request.
export function orderLines(items: z.infer<typeof line>[]) {
  const result = new Map<string, z.infer<typeof line>>();
  for (const row of items) {
    const old = result.get(row.variantId);
    const price =
      row.unitPrice === undefined
        ? undefined
        : stockDecimal(row.unitPrice).toFixed(2);
    if (old && old.unitPrice !== price)
      throw new BadRequestException('Один SKU має різні ціни.');
    const amount = stockDecimal(old?.quantity || 0).plus(row.quantity);
    if (amount.gt('9999999999999.999'))
      throw new BadRequestException('Завелика кількість.');
    result.set(row.variantId, {
      variantId: row.variantId,
      quantity: amount.toString(),
      unitPrice: price,
    });
  }
  return [...result.values()].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  );
}
