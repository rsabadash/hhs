import { z } from 'zod';
import { name, uuid } from './validation.js';
export const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Ціна: до 12 цифр і 2 знаків після крапки.');
export const assignments = z
  .array(z.object({ attributeId: uuid, valueId: uuid }).strict())
  .max(30)
  .refine(
    (a) => new Set(a.map((v) => v.attributeId)).size === a.length,
    'Атрибут можна вибрати лише один раз.',
  );
export const normalizeTag = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk-UA');
export const variantInput = z
  .object({
    id: uuid.optional(),
    name,
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(
        /^[\p{L}\p{N}._/-]+$/u,
        'SKU: літери, цифри, крапка, дефіс, / або _.',
      )
      .transform((v) => v.normalize('NFC').toUpperCase()),
    unitId: uuid,
    status: z.enum(['DRAFT', 'PUBLISHED']),
    sellPrice: money.nullable(),
    archived: z.boolean(),
    attributes: assignments,
  })
  .strict()
  .refine(
    (v) =>
      v.status !== 'PUBLISHED' ||
      (!v.archived && v.sellPrice !== null && Number(v.sellPrice) > 0),
    'Для публікації потрібна додатна ціна та активний варіант.',
  );
export const productInput = z
  .object({
    name,
    description: z.string().trim().max(10000),
    categoryId: uuid,
    archived: z.boolean(),
    updatedAt: z.iso.datetime().optional(),
    tags: z
      .array(z.string().transform(normalizeTag).pipe(z.string().min(1).max(60)))
      .max(30)
      .transform((v) => [...new Set(v)]),
    attributes: assignments,
    variants: z.array(variantInput).min(1).max(50),
  })
  .strict()
  .superRefine((p, ctx) => {
    const skus = new Set<string>();
    const ids = new Set<string>();
    const combinations = new Set<string>();
    for (const v of p.variants) {
      if (skus.has(v.sku) || (v.id && ids.has(v.id)))
        ctx.addIssue({
          code: 'custom',
          message: 'SKU та ідентифікатори варіантів не можуть повторюватися.',
        });
      skus.add(v.sku);
      if (v.id) ids.add(v.id);
      if (
        v.attributes.some((a) =>
          p.attributes.some((b) => b.attributeId === a.attributeId),
        )
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Спільний атрибут не можна повторювати у варіанті.',
        });
      const key = v.attributes
        .map((a) => a.valueId)
        .sort()
        .join(',');
      if (!v.archived && combinations.has(key))
        ctx.addIssue({
          code: 'custom',
          message: 'Активні варіанти повинні мати різні комбінації атрибутів.',
        });
      if (!v.archived) combinations.add(key);
    }
  });
export const catalogQuery = z
  .object({
    q: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    sort: z.enum(['asc', 'desc']).default('asc'),
    categoryId: uuid.optional(),
    tag: z.string().max(60).transform(normalizeTag).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    archived: z.enum(['true', 'false']).default('false'),
    minPrice: money.optional(),
    maxPrice: money.optional(),
    warehouseId: uuid.optional(),
    inStock: z.enum(['true', 'false']).optional(),
    valueIds: z
      .string()
      .max(1200)
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(uuid).max(30))
      .optional(),
  })
  .strict()
  .refine(
    (q) =>
      !q.minPrice || !q.maxPrice || Number(q.minPrice) <= Number(q.maxPrice),
    'Мінімальна ціна більша за максимальну.',
  );
export const imageInput = z
  .object({
    variantId: uuid.nullable(),
    alt: z.string().trim().max(250),
    data: z.string().max(4194400),
  })
  .strict();
export const imageEdit = z
  .object({
    variantId: uuid.nullable(),
    alt: z.string().trim().max(250),
    position: z.number().int().min(0).max(999),
  })
  .strict();
