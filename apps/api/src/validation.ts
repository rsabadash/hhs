import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Перевірте заповнення полів.',
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
export const uuid = z.uuid();
export const name = z.string().trim().min(1, 'Вкажіть назву.').max(160);
export const referenceKind = z.enum([
  'categories',
  'attributes',
  'attribute-values',
  'units',
  'warehouses',
  'suppliers',
]);
export type ReferenceKind = z.infer<typeof referenceKind>;
export const listQuery = z
  .object({
    q: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    sort: z.enum(['asc', 'desc']).default('asc'),
    parentId: z.union([uuid, z.literal('root')]).optional(),
    attributeId: uuid.optional(),
    kind: z.enum(['CHOICE', 'NUMBER', 'TEXT']).optional(),
    allowsFraction: z.enum(['true', 'false']).optional(),
    hasContact: z.enum(['true', 'false']).optional(),
    hasAddress: z.enum(['true', 'false']).optional(),
  })
  .strict();
export const categoryInput = z
  .object({ name, parentId: uuid.nullable().default(null) })
  .strict();
export const unitInput = z
  .object({
    name,
    symbol: z.string().trim().min(1).max(20),
    allowsFraction: z.boolean(),
  })
  .strict();
export const warehouseInput = z
  .object({ name, address: z.string().trim().max(500).default('') })
  .strict();
export const supplierInput = z
  .object({
    name,
    email: z.union([z.email(), z.literal('')]).default(''),
    phone: z.string().trim().max(60).default(''),
  })
  .strict();
export const attributeInput = z
  .object({
    name,
    kind: z.enum(['CHOICE', 'NUMBER', 'TEXT']),
    measurementSymbol: z.string().trim().max(20).nullable().default(null),
  })
  .strict()
  .refine((value) => value.kind === 'NUMBER' || !value.measurementSymbol, {
    path: ['measurementSymbol'],
    message: 'Одиниця вимірювання доступна лише для числових атрибутів.',
  });
export const valueInput = z
  .object({
    attributeId: uuid,
    label: name,
    numericValue: z
      .string()
      .regex(
        /^-?\d{1,12}(\.\d{1,4})?$/,
        'Вкажіть число: до 12 цифр і 4 знаків після крапки.',
      )
      .nullable()
      .default(null),
  })
  .strict();
