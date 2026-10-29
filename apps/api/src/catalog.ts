import { acquireWriteLock } from './write-lock.js';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Database } from './db.js';
import { AdminGuard } from './auth.js';
import { Prisma } from './generated/prisma/client.js';
import { parse, uuid } from './validation.js';
import { catalogQuery, productInput } from './catalog-validation.js';
export const catalogInclude = {
  category: true,
  tags: { include: { tag: true } },
  attributes: { include: { value: { include: { attribute: true } } } },
  variants: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      unit: true,
      attributes: { include: { value: { include: { attribute: true } } } },
    },
  },
  images: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] },
};
export function catalogError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002')
      throw new ConflictException(
        'Такий SKU уже існує. Перевірте унікальність.',
      );
    if (error.code === 'P2003')
      throw new BadRequestException(
        'Пов’язаний запис не знайдено або він використовується.',
      );
    if (error.code === 'P2025')
      throw new NotFoundException('Товар не знайдено.');
  }
  throw error;
}
@Injectable()
export class CatalogService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async get(id: string) {
    const item = await this.db.product.findUnique({
      where: { id },
      include: catalogInclude,
    });
    if (!item) throw new NotFoundException('Товар не знайдено.');
    return item;
  }
  async list(input: unknown) {
    const q = parse(catalogQuery, input);
    return this.db.$transaction(
      async (tx) => {
        let categories: string[] | undefined;
        if (q.categoryId) {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`WITH RECURSIVE subtree AS (SELECT id FROM "Category" WHERE id=${q.categoryId}::uuid UNION SELECT c.id FROM "Category" c JOIN subtree s ON c."parentId"=s.id) SELECT id FROM subtree`;
          categories = rows.map((c) => c.id);
        }
        // Every variant-level condition is inside the same SOME clause.
        const variant: Prisma.VariantWhereInput = {
          archivedAt: null,
          status: q.status,
          ...(q.minPrice || q.maxPrice
            ? { sellPrice: { gte: q.minPrice, lte: q.maxPrice } }
            : {}),
          ...(q.inStock
            ? {
                balances:
                  q.inStock === 'true'
                    ? {
                        some: {
                          warehouseId: q.warehouseId,
                          quantity: { gt: 0 },
                        },
                      }
                    : {
                        none: {
                          warehouseId: q.warehouseId,
                          quantity: { gt: 0 },
                        },
                      },
              }
            : {}),
        };
        const filters: Prisma.ProductWhereInput[] = [];
        if (q.valueIds?.length) {
          const values = await tx.attributeValue.findMany({
            where: { id: { in: q.valueIds } },
          });
          if (values.length !== new Set(q.valueIds).size)
            throw new BadRequestException('Значення атрибута не знайдено.');
          // Shared values apply to all variants; otherwise the selected value must be on this same SKU.
          variant.AND = values.map((v) => ({
            OR: [
              { attributes: { some: { valueId: v.id } } },
              { product: { attributes: { some: { valueId: v.id } } } },
            ],
          }));
        }
        if (q.q)
          filters.push({
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              {
                variants: {
                  some: {
                    ...variant,
                    sku: { contains: q.q, mode: 'insensitive' },
                  },
                },
              },
            ],
          });
        if (
          q.status ||
          q.minPrice ||
          q.maxPrice ||
          q.inStock ||
          q.valueIds?.length
        )
          filters.push({ variants: { some: variant } });
        const where: Prisma.ProductWhereInput = {
          archivedAt: q.archived === 'true' ? { not: null } : null,
          categoryId: categories ? { in: categories } : undefined,
          ...(q.tag ? { tags: { some: { tag: { name: q.tag } } } } : {}),
          AND: filters,
        };
        const [items, total] = await Promise.all([
          tx.product.findMany({
            where,
            take: q.pageSize,
            skip: (q.page - 1) * q.pageSize,
            orderBy: [{ name: q.sort }, { id: q.sort }],
            select: {
              id: true,
              name: true,
              archivedAt: true,
              category: { select: { name: true } },
              variants: {
                select: {
                  id: true,
                  sku: true,
                  status: true,
                  sellPrice: true,
                  archivedAt: true,
                },
                orderBy: { sku: 'asc' },
              },
              tags: { include: { tag: true } },
            },
          }),
          tx.product.count({ where }),
        ]);
        return { items, total, page: q.page, pageSize: q.pageSize };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async save(id: string | undefined, input: unknown) {
    const data = parse(productInput, input);
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Same lock as references: attribute edits, tag cleanup and catalog writes are atomic across replicas.
          await acquireWriteLock(tx);
          const old = id
            ? await tx.product.findUnique({
                where: { id },
                include: { variants: true },
              })
            : null;
          if (id && !old) throw new NotFoundException('Товар не знайдено.');
          if (old && old.updatedAt.toISOString() !== data.updatedAt)
            throw new ConflictException(
              'Товар уже змінено. Оновіть сторінку перед редагуванням.',
            );
          if (
            data.variants.some(
              (v) => v.id && !old?.variants.some((o) => o.id === v.id),
            )
          )
            throw new BadRequestException('Варіант належить іншому товару.');
          if (
            old?.variants.some((v) => !data.variants.some((n) => n.id === v.id))
          )
            throw new ConflictException(
              'Варіанти не можна видаляти. Позначте їх як архівні.',
            );
          if (
            !(await tx.category.findUnique({ where: { id: data.categoryId } }))
          )
            throw new BadRequestException('Виберіть категорію.');
          const all = [
            ...data.attributes,
            ...data.variants.flatMap((v) => v.attributes),
          ];
          const values = await tx.attributeValue.findMany({
            where: { id: { in: all.map((a) => a.valueId) } },
          });
          if (
            all.some(
              (a) =>
                !values.some(
                  (v) => v.id === a.valueId && v.attributeId === a.attributeId,
                ),
            )
          )
            throw new BadRequestException('Значення не відповідає атрибуту.');
          for (const v of data.variants) {
            if (!(await tx.unit.findUnique({ where: { id: v.unitId } })))
              throw new BadRequestException('Виберіть одиницю варіанта.');
            const previous = old?.variants.find((o) => o.id === v.id);
            if (previous && previous.unitId !== v.unitId) {
              const history = await tx.variant.count({
                where: {
                  id: v.id,
                  OR: [
                    { balances: { some: {} } },
                    { supplyItems: { some: {} } },
                    { orderItems: { some: {} } },
                    { countItems: { some: {} } },
                  ],
                },
              });
              if (history)
                throw new ConflictException(
                  'Одиницю SKU з документами або залишками змінити не можна.',
                );
            }
          }
          const base = {
            name: data.name,
            description: data.description,
            categoryId: data.categoryId,
            archivedAt: data.archived ? (old?.archivedAt ?? new Date()) : null,
          };
          const product = old
            ? await tx.product.update({
                where: { id },
                data: {
                  ...base,
                  updatedAt: new Date(
                    Math.max(Date.now(), old.updatedAt.getTime() + 1),
                  ),
                },
              })
            : await tx.product.create({ data: base });
          await tx.productAttributeValue.deleteMany({
            where: { productId: product.id },
          });
          await tx.productAttributeValue.createMany({
            data: data.attributes.map((a) => ({ ...a, productId: product.id })),
          });
          await tx.productTag.deleteMany({ where: { productId: product.id } });
          for (const name of data.tags) {
            const tag = await tx.tag.upsert({
              where: { name },
              create: { name },
              update: {},
            });
            await tx.productTag.create({
              data: { productId: product.id, tagId: tag.id },
            });
          }
          await tx.tag.deleteMany({ where: { products: { none: {} } } });
          for (const v of data.variants) {
            const base = {
              name: v.name,
              sku: v.sku,
              unitId: v.unitId,
              status: data.archived ? ('DRAFT' as const) : v.status,
              sellPrice: v.sellPrice,
              archivedAt: v.archived
                ? (old?.variants.find((o) => o.id === v.id)?.archivedAt ??
                  new Date())
                : null,
            };
            const saved = v.id
              ? await tx.variant.update({ where: { id: v.id }, data: base })
              : await tx.variant.create({
                  data: { ...base, productId: product.id },
                });
            await tx.variantAttributeValue.deleteMany({
              where: { variantId: saved.id },
            });
            await tx.variantAttributeValue.createMany({
              data: v.attributes.map((a) => ({ ...a, variantId: saved.id })),
            });
          }
          return tx.product.findUniqueOrThrow({
            where: { id: product.id },
            include: catalogInclude,
          });
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      catalogError(error);
    }
  }
}
@Controller('admin/products')
@UseGuards(AdminGuard)
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get() list(@Query() query: unknown) {
    return this.catalog.list(query);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.catalog.get(parse(uuid, id));
  }
  @Post() create(@Body() body: unknown) {
    return this.catalog.save(undefined, body);
  }
  @Put(':id') update(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.save(parse(uuid, id), body);
  }
}
