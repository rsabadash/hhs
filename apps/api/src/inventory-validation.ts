import { z } from 'zod';
import { uuid } from './validation.js';
export const quantity = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,12})(\.\d{1,3})?$/,
    'Кількість: до 13 цифр і 3 знаків після крапки.',
  );
export const cost = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/,
    'Ціна: до 12 цифр і 2 знаків після крапки.',
  );
export const revisionInput = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();
const base = {
  reference: z.string().trim().min(1).max(80),
  warehouseId: uuid,
  notes: z.string().trim().max(2000).default(''),
  revision: z.number().int().nonnegative().optional(),
};
const unique = (rows: { variantId: string }[]) =>
  new Set(rows.map((r) => r.variantId)).size === rows.length;
export const supplyInput = z
  .object({
    ...base,
    supplierId: uuid,
    items: z
      .array(
        z
          .object({
            variantId: uuid,
            quantity: quantity.refine(
              (v) => Number(v) > 0,
              'Вкажіть додатну кількість.',
            ),
            unitCost: cost,
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(unique, 'SKU не може повторюватись.'),
  })
  .strict();
export const countInput = z
  .object({
    ...base,
    items: z
      .array(z.object({ variantId: uuid }).strict())
      .min(1)
      .max(100)
      .refine(unique, 'SKU не може повторюватись.'),
  })
  .strict();
export const countResults = z
  .object({
    revision: z.number().int().nonnegative(),
    items: z
      .array(
        z
          .object({
            variantId: uuid,
            actualQuantity: quantity.nullable(),
            reason: z.string().trim().max(500).default(''),
            excluded: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(unique, 'SKU не може повторюватись.'),
  })
  .strict();
export const recountInput = revisionInput.extend({ variantId: uuid }).strict();
const date = z.iso.date();
export const inventoryQuery = z
  .object({
    q: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    sort: z.enum(['asc', 'desc']).default('desc'),
    warehouseId: uuid.optional(),
    supplierId: uuid.optional(),
    status: z
      .enum(['DRAFT', 'RECEIVED', 'COUNTING', 'POSTED', 'CANCELLED'])
      .optional(),
    from: date.optional(),
    to: date.optional(),
    dateField: z.enum(['createdAt', 'receivedAt']).default('createdAt'),
    kind: z.enum(['RECEIPT', 'COUNT', 'SALE', 'CANCELLATION']).optional(),
    categoryId: uuid.optional(),
    tag: z.string().trim().max(60).optional(),
    valueIds: z
      .string()
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(uuid).max(30))
      .optional(),
    inStock: z.enum(['true', 'false']).optional(),
    variantId: uuid.optional(),
    archived: z.enum(['true', 'false', 'all']).default('false'),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    'Початкова дата має бути не пізніше кінцевої.',
  );
