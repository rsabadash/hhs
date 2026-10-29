import {
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from './db.js';
import { Prisma } from './generated/prisma/client.js';
import { catalogQuery } from './catalog-validation.js';
import { parse, uuid } from './validation.js';

// Public callers cannot request drafts, archived records, or warehouse data.
export const storefrontQuery = z
  .object(catalogQuery.shape)
  .omit({ status: true, archived: true, warehouseId: true })
  .extend({
    pageSize: z.coerce.number().int().min(1).max(24).default(12),
  })
  .strict()
  .refine(
    (q) =>
      !q.minPrice || !q.maxPrice || Number(q.minPrice) <= Number(q.maxPrice),
    'Мінімальна ціна більша за максимальну.',
  );
const visible: Prisma.VariantWhereInput = {
  status: 'PUBLISHED',
  archivedAt: null,
  sellPrice: { gt: 0 },
};
const publicProduct: Prisma.ProductWhereInput = {
  archivedAt: null,
  variants: { some: visible },
};
const attributeSelect = {
  value: {
    select: {
      id: true,
      label: true,
      attribute: { select: { id: true, name: true, measurementSymbol: true } },
    },
  },
} satisfies Prisma.ProductAttributeValueSelect;
const imageSelect = {
  id: true,
  url: true,
  alt: true,
} satisfies Prisma.ImageSelect;
const variantSelect = {
  id: true,
  sku: true,
  name: true,
  sellPrice: true,
  unit: { select: { name: true, symbol: true } },
  attributes: { select: attributeSelect, orderBy: { attributeId: 'asc' } },
  images: {
    select: imageSelect,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  },
  // Only existence is needed: never expose warehouse IDs or precise quantities.
  balances: {
    where: { quantity: { gt: 0 } },
    take: 1,
    select: { quantity: true },
  },
} satisfies Prisma.VariantSelect;
const productSelect = {
  id: true,
  name: true,
  description: true,
  category: { select: { id: true, name: true } },
  tags: {
    select: { tag: { select: { name: true } } },
    orderBy: { tag: { name: 'asc' } },
  },
  attributes: { select: attributeSelect, orderBy: { attributeId: 'asc' } },
  images: {
    where: { variantId: null },
    select: imageSelect,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  },
  variants: {
    where: visible,
    select: variantSelect,
    orderBy: [{ sku: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProductSelect;
type Product = Prisma.ProductGetPayload<{ select: typeof productSelect }>;
function serialize(product: Product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    tags: product.tags.map(({ tag }) => tag.name),
    attributes: product.attributes.map(({ value }) => value),
    images: product.images,
    variants: product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: v.sellPrice!.toFixed(2),
      unit: v.unit,
      inStock: v.balances.length > 0,
      attributes: v.attributes.map(({ value }) => value),
      images: v.images.length ? v.images : product.images,
    })),
  };
}
@Injectable()
export class StorefrontService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async list(input: unknown) {
    const q = parse(storefrontQuery, input);
    return this.db.$transaction(
      async (tx) => {
        let categoryIds: string[] | undefined;
        if (q.categoryId) {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`WITH RECURSIVE tree AS (SELECT id FROM "Category" WHERE id=${q.categoryId}::uuid UNION SELECT c.id FROM "Category" c JOIN tree t ON c."parentId"=t.id) SELECT id FROM tree`;
          categoryIds = rows.map((r) => r.id);
        }
        const variant: Prisma.VariantWhereInput = {
          ...visible,
          sellPrice: { gt: 0, gte: q.minPrice, lte: q.maxPrice },
          ...(q.inStock
            ? {
                balances:
                  q.inStock === 'true'
                    ? { some: { quantity: { gt: 0 } } }
                    : { none: { quantity: { gt: 0 } } },
              }
            : {}),
          AND: [
            ...(q.q
              ? [
                  {
                    OR: [
                      { sku: { contains: q.q, mode: 'insensitive' as const } },
                      {
                        product: {
                          name: { contains: q.q, mode: 'insensitive' as const },
                        },
                      },
                    ],
                  },
                ]
              : []),
            ...(q.valueIds ?? []).map((id) => ({
              OR: [
                { attributes: { some: { valueId: id } } },
                { product: { attributes: { some: { valueId: id } } } },
              ],
            })),
          ],
        };
        const where: Prisma.ProductWhereInput = {
          archivedAt: null,
          categoryId: categoryIds ? { in: categoryIds } : undefined,
          ...(q.tag ? { tags: { some: { tag: { name: q.tag } } } } : {}),
          variants: { some: variant },
        };
        const [products, total] = await Promise.all([
          tx.product.findMany({
            where,
            select: {
              ...productSelect,
              variants: { ...productSelect.variants, where: variant },
            },
            orderBy: [{ name: q.sort }, { id: q.sort }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.product.count({ where }),
        ]);
        const items = products.map((p) => {
          const item = serialize(p);
          const cheapest = item.variants.reduce((a, b) =>
            new Prisma.Decimal(a.price).lte(b.price) ? a : b,
          );
          return {
            id: item.id,
            name: item.name,
            category: item.category,
            image: cheapest.images[0] ?? null,
            price: cheapest.price,
            unit: cheapest.unit,
            variantId: cheapest.id,
            inStock: item.variants.some((v) => v.inStock),
            matchingVariants: item.variants.length,
          };
        });
        return { items, total, page: q.page, pageSize: q.pageSize };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async get(id: string) {
    const product = await this.db.product.findFirst({
      where: { ...publicProduct, id: parse(uuid, id) },
      select: productSelect,
    });
    if (!product)
      throw new NotFoundException('Товар не знайдено або знято з публікації.');
    return serialize(product);
  }
  async filters() {
    return this.db.$transaction(
      async (tx) => {
        const [categories, tags, attributes] = await Promise.all([
          tx.$queryRaw<
            { id: string; name: string; parentId: string | null }[]
          >`WITH RECURSIVE tree AS (
          SELECT c.id,c.name,c."parentId" FROM "Category" c WHERE EXISTS (
            SELECT 1 FROM "Product" p JOIN "Variant" v ON v."productId"=p.id
            WHERE p."categoryId"=c.id AND p."archivedAt" IS NULL AND v."archivedAt" IS NULL AND v.status='PUBLISHED' AND v."sellPrice">0
          ) UNION SELECT c.id,c.name,c."parentId" FROM "Category" c JOIN tree t ON t."parentId"=c.id
        ) SELECT * FROM tree ORDER BY name,id`,
          tx.tag.findMany({
            where: { products: { some: { product: publicProduct } } },
            select: { name: true },
            orderBy: { name: 'asc' },
          }),
          tx.attributeValue.findMany({
            where: {
              OR: [
                { products: { some: { product: publicProduct } } },
                {
                  variants: {
                    some: {
                      variant: { ...visible, product: { archivedAt: null } },
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              label: true,
              attribute: {
                select: { id: true, name: true, measurementSymbol: true },
              },
            },
            orderBy: [
              { attribute: { name: 'asc' } },
              { label: 'asc' },
              { id: 'asc' },
            ],
          }),
        ]);
        return {
          categories,
          tags: tags.map((t) => t.name),
          values: attributes,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
@Controller('catalog')
export class StorefrontController {
  constructor(
    @Inject(StorefrontService) private readonly service: StorefrontService,
  ) {}
  @Get('filters') @Header('Cache-Control', 'no-store') filters() {
    return this.service.filters();
  }
  @Get() @Header('Cache-Control', 'no-store') list(@Query() query: unknown) {
    return this.service.list(query);
  }
  @Get(':id') @Header('Cache-Control', 'no-store') get(
    @Param('id') id: string,
  ) {
    return this.service.get(id);
  }
}
