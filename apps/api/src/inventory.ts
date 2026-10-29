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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Database } from './db.js';
import { AdminGuard, type AdminRequest } from './auth.js';
import { Prisma } from './generated/prisma/client.js';
import { parse, uuid } from './validation.js';
import { stockDecimal as decimal, purchaseTotal } from './inventory-math.js';
import {
  countInput,
  countResults,
  inventoryQuery,
  recountInput,
  revisionInput,
  supplyInput,
} from './inventory-validation.js';
type Tx = Prisma.TransactionClient;
const variantInclude = {
  unit: true,
  product: {
    include: {
      category: true,
      attributes: { include: { value: { include: { attribute: true } } } },
    },
  },
  attributes: { include: { value: { include: { attribute: true } } } },
};
const actor = { select: { email: true } };
const supplyInclude = {
  warehouse: true,
  supplier: true,
  createdBy: actor,
  receivedBy: actor,
  items: {
    orderBy: { id: 'asc' as const },
    include: { variant: { include: variantInclude } },
  },
};
const countInclude = {
  warehouse: true,
  createdBy: actor,
  startedBy: actor,
  postedBy: actor,
  cancelledBy: actor,
  items: {
    orderBy: { id: 'asc' as const },
    include: { variant: { include: variantInclude } },
  },
};
const conflict = () =>
  new ConflictException('Документ змінився. Оновіть сторінку й повторіть дію.');
function checkRevision(current: number, provided: number | undefined) {
  if (provided !== current) throw conflict();
}
function checkQuantity(
  value: string | Prisma.Decimal,
  fractional: boolean,
  sku: string,
) {
  if (!fractional && !decimal(value).isInteger())
    throw new BadRequestException(
      `${sku}: одиниця допускає лише цілу кількість.`,
    );
}
function supplyView<
  T extends { items: { quantity: Prisma.Decimal; unitCost: Prisma.Decimal }[] },
>(doc: T) {
  return {
    ...doc,
    total: purchaseTotal(doc.items),
    items: doc.items.map((i) => ({
      ...i,
      total: decimal(i.quantity).times(i.unitCost).toFixed(2),
    })),
  };
}
@Injectable()
export class InventoryService {
  constructor(@Inject(Database) private readonly db: Database) {}
  // Shared with reference/catalog mutations: unit changes and archiving cannot
  // race stock operations. Order writes use this transaction too.
  async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await acquireWriteLock(tx);
          return fn(tx);
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new ConflictException('Документ із таким номером уже існує.');
        if (e.code === 'P2003' || e.code === 'P2025')
          throw new BadRequestException('Пов’язаний запис не знайдено.');
      }
      throw e;
    }
  }
  private async variants(tx: Tx, ids: string[], active: boolean) {
    const rows = await tx.variant.findMany({
      where: { id: { in: ids } },
      include: variantInclude,
    });
    if (rows.length !== ids.length)
      throw new BadRequestException('Один із SKU не знайдено.');
    if (active && rows.some((v) => v.archivedAt || v.product.archivedAt))
      throw new BadRequestException(
        'Архівний товар не можна додати до постачання.',
      );
    return new Map(rows.map((v) => [v.id, v]));
  }
  async supply(id: string) {
    const doc = await this.db.supply.findUnique({
      where: { id },
      include: supplyInclude,
    });
    if (!doc) throw new NotFoundException('Постачання не знайдено.');
    return supplyView(doc);
  }
  async saveSupply(id: string | undefined, input: unknown, adminId: string) {
    const data = parse(supplyInput, input);
    const saved = await this.write(async (tx) => {
      const old = id ? await tx.supply.findUnique({ where: { id } }) : null;
      if (id && !old) throw new NotFoundException('Постачання не знайдено.');
      if (old) {
        if (old.status !== 'DRAFT')
          throw new ConflictException(
            'Отримане постачання не можна редагувати.',
          );
        checkRevision(old.revision, data.revision);
      }
      const variants = await this.variants(
        tx,
        data.items.map((i) => i.variantId),
        true,
      );
      const items = data.items.map((i) => {
        const v = variants.get(i.variantId)!;
        checkQuantity(i.quantity, v.unit.allowsFraction, v.sku);
        return {
          ...i,
          unitSymbol: v.unit.symbol,
        };
      });
      const base = {
        reference: data.reference,
        warehouseId: data.warehouseId,
        supplierId: data.supplierId,
        notes: data.notes,
      };
      if (old) await tx.supplyItem.deleteMany({ where: { supplyId: old.id } });
      return old
        ? tx.supply.update({
            where: { id: old.id },
            data: {
              ...base,
              revision: { increment: 1 },
              items: { createMany: { data: items } },
            },
          })
        : tx.supply.create({
            data: {
              ...base,
              createdById: adminId,
              items: { createMany: { data: items } },
            },
          });
    });
    return this.supply(saved.id);
  }
  async receive(id: string, input: unknown, adminId: string) {
    const { revision } = parse(revisionInput, input);
    await this.write(async (tx) => {
      const doc = await tx.supply.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException('Постачання не знайдено.');
      if (doc.status === 'RECEIVED') return; // safe retry after a lost response
      checkRevision(doc.revision, revision);
      if (!doc.items.length)
        throw new BadRequestException('Додайте хоча б один SKU.');
      const variants = await this.variants(
        tx,
        doc.items.map((i) => i.variantId),
        true,
      );
      for (const item of doc.items) {
        const v = variants.get(item.variantId)!;
        checkQuantity(item.quantity, v.unit.allowsFraction, v.sku);
      }
      await this.move(
        tx,
        doc.warehouseId,
        doc.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          kind: 'RECEIPT' as const,
          supplyItemId: item.id,
          actorId: adminId,
        })),
      );
      await tx.supply.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
          receivedById: adminId,
          revision: { increment: 1 },
        },
      });
    });
    return this.supply(id);
  }
  private async balance(tx: Tx, variantId: string, warehouseId: string) {
    return tx.stockBalance.upsert({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      create: { variantId, warehouseId },
      update: {},
    });
  }
  // Call only inside write(), with one aggregated change per SKU.
  async move(
    tx: Tx,
    warehouseId: string,
    changes: {
      variantId: string;
      quantity: Prisma.Decimal;
      kind: 'RECEIPT' | 'COUNT' | 'SALE' | 'CANCELLATION';
      actorId: string;
      supplyItemId?: string;
      countItemId?: string;
      orderItemId?: string;
    }[],
  ) {
    if (!changes.length) return;
    await tx.stockBalance.createMany({
      data: changes.map((i) => ({ variantId: i.variantId, warehouseId })),
      skipDuplicates: true,
    });
    const balances = await tx.stockBalance.findMany({
      where: {
        warehouseId,
        variantId: { in: changes.map((i) => i.variantId) },
      },
    });
    const byId = new Map(balances.map((b) => [b.variantId, b]));
    for (const item of changes) {
      const next = byId.get(item.variantId)!.quantity.plus(item.quantity);
      if (next.isNegative() || next.greaterThan('9999999999999.999'))
        throw new BadRequestException(
          'Підсумкова кількість виходить за допустимі межі.',
        );
    }
    const values = Prisma.join(
      changes.map(
        (i) =>
          Prisma.sql`(${i.variantId}::uuid, ${i.quantity.toString()}::numeric)`,
      ),
    );
    await tx.$executeRaw`UPDATE "StockBalance" b SET "quantity"=b."quantity"+v.delta, "revision"=b."revision"+1 FROM (VALUES ${values}) AS v(id,delta) WHERE b."variantId"=v.id AND b."warehouseId"=${warehouseId}::uuid`;
    await tx.stockMovement.createMany({
      data: changes.map((i) => ({ ...i, warehouseId })),
    });
  }
  async count(id: string) {
    return this.db.$transaction(
      async (tx) => {
        const doc = await tx.inventoryCount.findUnique({
          where: { id },
          include: countInclude,
        });
        if (!doc) throw new NotFoundException('Інвентаризацію не знайдено.');
        const balances = await tx.stockBalance.findMany({
          where: {
            warehouseId: doc.warehouseId,
            variantId: { in: doc.items.map((i) => i.variantId) },
          },
        });
        return {
          ...doc,
          items: doc.items.map((i) => ({
            ...i,
            difference:
              i.actualQuantity?.minus(i.expectedQuantity).toString() ?? null,
            stale:
              doc.status === 'COUNTING' &&
              (balances.find((b) => b.variantId === i.variantId)?.revision ??
                0) !== i.expectedRevision,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async saveCount(id: string | undefined, input: unknown, adminId: string) {
    const data = parse(countInput, input);
    const saved = await this.write(async (tx) => {
      const old = id
        ? await tx.inventoryCount.findUnique({ where: { id } })
        : null;
      if (id && !old)
        throw new NotFoundException('Інвентаризацію не знайдено.');
      if (old) {
        if (old.status !== 'DRAFT')
          throw new ConflictException(
            'Склад підрахунку можна змінити лише в чернетці.',
          );
        checkRevision(old.revision, data.revision);
      }
      await this.variants(
        tx,
        data.items.map((i) => i.variantId),
        false,
      );
      const base = {
        reference: data.reference,
        warehouseId: data.warehouseId,
        notes: data.notes,
      };
      const items = data.items.map((i) => ({
        ...i,
        expectedQuantity: 0,
        expectedRevision: 0,
      }));
      if (old)
        await tx.inventoryCountItem.deleteMany({ where: { countId: old.id } });
      return old
        ? tx.inventoryCount.update({
            where: { id: old.id },
            data: {
              ...base,
              revision: { increment: 1 },
              items: { createMany: { data: items } },
            },
          })
        : tx.inventoryCount.create({
            data: {
              ...base,
              createdById: adminId,
              items: { createMany: { data: items } },
            },
          });
    });
    return this.count(saved.id);
  }
  async start(id: string, input: unknown, adminId: string) {
    const { revision } = parse(revisionInput, input);
    await this.write(async (tx) => {
      const doc = await tx.inventoryCount.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException('Інвентаризацію не знайдено.');
      if (doc.status === 'COUNTING') return;
      if (doc.status !== 'DRAFT')
        throw new ConflictException('Документ уже завершено.');
      checkRevision(doc.revision, revision);
      if (!doc.items.length)
        throw new BadRequestException('Додайте хоча б один SKU.');
      await tx.stockBalance.createMany({
        data: doc.items.map((i) => ({
          variantId: i.variantId,
          warehouseId: doc.warehouseId,
        })),
        skipDuplicates: true,
      });
      await tx.$executeRaw`UPDATE "InventoryCountItem" i SET "expectedQuantity"=b.quantity, "expectedRevision"=b.revision, "actualQuantity"=NULL FROM "StockBalance" b WHERE i."countId"=${id}::uuid AND b."variantId"=i."variantId" AND b."warehouseId"=i."warehouseId"`;
      await tx.inventoryCount.update({
        where: { id },
        data: {
          status: 'COUNTING',
          startedAt: new Date(),
          startedById: adminId,
          revision: { increment: 1 },
        },
      });
    });
    return this.count(id);
  }
  async results(id: string, input: unknown) {
    const data = parse(countResults, input);
    await this.write(async (tx) => {
      const doc = await tx.inventoryCount.findUnique({
        where: { id },
        include: {
          items: { include: { variant: { include: { unit: true } } } },
        },
      });
      if (!doc) throw new NotFoundException('Інвентаризацію не знайдено.');
      if (doc.status !== 'COUNTING')
        throw new ConflictException('Спочатку почніть підрахунок.');
      checkRevision(doc.revision, data.revision);
      if (
        doc.items.length !== data.items.length ||
        data.items.some(
          (i) => !doc.items.some((o) => o.variantId === i.variantId),
        )
      )
        throw new BadRequestException('Передайте всі рядки цього підрахунку.');
      for (const item of data.items) {
        const old = doc.items.find((i) => i.variantId === item.variantId)!;
        if (item.actualQuantity !== null)
          checkQuantity(
            item.actualQuantity,
            old.variant.unit.allowsFraction,
            old.variant.sku,
          );
      }
      const values = Prisma.join(
        data.items.map(
          (i) =>
            Prisma.sql`(${i.variantId}::uuid, ${i.excluded ? null : i.actualQuantity}::numeric, ${i.reason}::text, ${i.excluded}::boolean)`,
        ),
      );
      await tx.$executeRaw`UPDATE "InventoryCountItem" i SET "actualQuantity"=v.actual, reason=v.reason, excluded=v.excluded FROM (VALUES ${values}) AS v(id,actual,reason,excluded) WHERE i."countId"=${id}::uuid AND i."variantId"=v.id`;
      await tx.inventoryCount.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
    });
    return this.count(id);
  }
  async recount(id: string, input: unknown) {
    const data = parse(recountInput, input);
    await this.write(async (tx) => {
      const doc = await tx.inventoryCount.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException('Інвентаризацію не знайдено.');
      if (doc.status !== 'COUNTING')
        throw new ConflictException('Документ не в підрахунку.');
      checkRevision(doc.revision, data.revision);
      const item = doc.items.find((i) => i.variantId === data.variantId);
      if (!item)
        throw new BadRequestException('SKU відсутній у цьому документі.');
      const b = await this.balance(tx, item.variantId, doc.warehouseId);
      await tx.inventoryCountItem.update({
        where: { id: item.id },
        data: {
          expectedQuantity: b.quantity,
          expectedRevision: b.revision,
          actualQuantity: null,
          reason: '',
          excluded: false,
        },
      });
      await tx.inventoryCount.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
    });
    return this.count(id);
  }
  async finish(id: string, input: unknown, adminId: string, cancel: boolean) {
    const { revision } = parse(revisionInput, input);
    await this.write(async (tx) => {
      const doc = await tx.inventoryCount.findUnique({
        where: { id },
        include: {
          items: { include: { variant: { include: { unit: true } } } },
        },
      });
      if (!doc) throw new NotFoundException('Інвентаризацію не знайдено.');
      const target = cancel ? 'CANCELLED' : 'POSTED';
      if (doc.status === target) return;
      checkRevision(doc.revision, revision);
      if (cancel) {
        if (doc.status !== 'DRAFT' && doc.status !== 'COUNTING')
          throw new ConflictException(
            'Проведений документ не можна скасувати.',
          );
        await tx.inventoryCount.update({
          where: { id },
          data: {
            status: target,
            cancelledAt: new Date(),
            cancelledById: adminId,
            revision: { increment: 1 },
          },
        });
        return;
      }
      if (doc.status !== 'COUNTING')
        throw new ConflictException('Спочатку почніть підрахунок.');
      const included = doc.items.filter((i) => !i.excluded);
      if (!included.length)
        throw new BadRequestException(
          'Залиште хоча б один рядок для проведення.',
        );
      const balances = await tx.stockBalance.findMany({
        where: {
          warehouseId: doc.warehouseId,
          variantId: { in: included.map((i) => i.variantId) },
        },
      });
      const byId = new Map(balances.map((b) => [b.variantId, b]));
      // Validate every line before writing any reconciliation movement.
      for (const item of included) {
        if (item.actualQuantity === null)
          throw new BadRequestException(
            `${item.variant.sku}: введіть фактичну кількість, навіть якщо це нуль.`,
          );
        checkQuantity(
          item.actualQuantity,
          item.variant.unit.allowsFraction,
          item.variant.sku,
        );
        const b = byId.get(item.variantId);
        if (
          !b ||
          b.revision !== item.expectedRevision ||
          !b.quantity.equals(item.expectedQuantity)
        )
          throw new ConflictException(
            `${item.variant.sku}: залишок змінився. Оновіть знімок і перерахуйте цей SKU.`,
          );
        if (
          !item.actualQuantity.equals(item.expectedQuantity) &&
          !item.reason.trim()
        )
          throw new BadRequestException(
            `${item.variant.sku}: поясніть розбіжність.`,
          );
      }
      await this.move(
        tx,
        doc.warehouseId,
        included
          .map((item) => ({
            variantId: item.variantId,
            quantity: item.actualQuantity!.minus(item.expectedQuantity),
            kind: 'COUNT' as const,
            countItemId: item.id,
            actorId: adminId,
          }))
          .filter((i) => !i.quantity.isZero()),
      );
      await tx.inventoryCount.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postedById: adminId,
          revision: { increment: 1 },
        },
      });
    });
    return this.count(id);
  }
  async list(
    kind: 'supplies' | 'counts' | 'movements' | 'balances' | 'variants',
    input: unknown,
  ) {
    const q = parse(inventoryQuery, input);
    const skip = (q.page - 1) * q.pageSize;
    const dateRange = {
      ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
      ...(q.to
        ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000) }
        : {}),
    };
    const searchVariant: Prisma.VariantWhereInput = q.q
      ? {
          OR: [
            { sku: { contains: q.q, mode: 'insensitive' } },
            { name: { contains: q.q, mode: 'insensitive' } },
            { product: { name: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {};
    return this.db.$transaction(
      async (tx) => {
        if (kind === 'supplies') {
          if (q.status && q.status !== 'DRAFT' && q.status !== 'RECEIVED')
            throw new BadRequestException('Невідомий статус постачання.');
          const where: Prisma.SupplyWhereInput = {
            warehouseId: q.warehouseId,
            supplierId: q.supplierId,
            status: q.status as 'DRAFT' | 'RECEIVED' | undefined,
            [q.dateField]: dateRange,
            ...(q.q
              ? {
                  OR: [
                    { reference: { contains: q.q, mode: 'insensitive' } },
                    { items: { some: { variant: searchVariant } } },
                  ],
                }
              : {}),
          };
          const items = await tx.supply.findMany({
            where,
            skip,
            take: q.pageSize,
            orderBy: [{ createdAt: q.sort }, { id: q.sort }],
            include: supplyInclude,
          });
          return {
            items: items.map(supplyView),
            total: await tx.supply.count({ where }),
            page: q.page,
            pageSize: q.pageSize,
          };
        }
        if (kind === 'counts') {
          if (q.status === 'RECEIVED')
            throw new BadRequestException('Невідомий статус інвентаризації.');
          const where: Prisma.InventoryCountWhereInput = {
            warehouseId: q.warehouseId,
            status: q.status as
              'DRAFT' | 'COUNTING' | 'POSTED' | 'CANCELLED' | undefined,
            createdAt: dateRange,
            ...(q.q
              ? {
                  OR: [
                    { reference: { contains: q.q, mode: 'insensitive' } },
                    { items: { some: { variant: searchVariant } } },
                  ],
                }
              : {}),
          };
          return {
            items: await tx.inventoryCount.findMany({
              where,
              skip,
              take: q.pageSize,
              orderBy: [{ createdAt: q.sort }, { id: q.sort }],
              include: { warehouse: true, _count: { select: { items: true } } },
            }),
            total: await tx.inventoryCount.count({ where }),
            page: q.page,
            pageSize: q.pageSize,
          };
        }
        if (kind === 'movements') {
          const where: Prisma.StockMovementWhereInput = {
            warehouseId: q.warehouseId,
            variantId: q.variantId,
            kind: q.kind,
            createdAt: dateRange,
            ...(q.q
              ? {
                  OR: [
                    { balance: { variant: searchVariant } },
                    {
                      supplyItem: {
                        supply: {
                          reference: { contains: q.q, mode: 'insensitive' },
                        },
                      },
                    },
                    {
                      countItem: {
                        count: {
                          reference: { contains: q.q, mode: 'insensitive' },
                        },
                      },
                    },
                    {
                      orderItem: {
                        order: {
                          reference: { contains: q.q, mode: 'insensitive' },
                        },
                      },
                    },
                  ],
                }
              : {}),
          };
          return {
            items: await tx.stockMovement.findMany({
              where,
              skip,
              take: q.pageSize,
              orderBy: [{ createdAt: q.sort }, { id: q.sort }],
              include: {
                actor,
                balance: {
                  include: {
                    warehouse: true,
                    variant: { include: variantInclude },
                  },
                },
                supplyItem: {
                  include: {
                    supply: { select: { id: true, reference: true } },
                  },
                },
                countItem: {
                  include: { count: { select: { id: true, reference: true } } },
                },
                orderItem: {
                  include: { order: { select: { id: true, reference: true } } },
                },
              },
            }),
            total: await tx.stockMovement.count({ where }),
            page: q.page,
            pageSize: q.pageSize,
          };
        }
        if (kind === 'balances' && !q.warehouseId)
          throw new BadRequestException('Виберіть склад.');
        const filters: Prisma.VariantWhereInput[] = [searchVariant];
        if (q.archived === 'false')
          filters.push({ archivedAt: null, product: { archivedAt: null } });
        if (q.archived === 'true')
          filters.push({
            OR: [
              { archivedAt: { not: null } },
              { product: { archivedAt: { not: null } } },
            ],
          });
        if (q.categoryId) {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`WITH RECURSIVE subtree AS (SELECT id FROM "Category" WHERE id=${q.categoryId}::uuid UNION SELECT c.id FROM "Category" c JOIN subtree s ON c."parentId"=s.id) SELECT id FROM subtree`;
          filters.push({
            product: { categoryId: { in: rows.map((r) => r.id) } },
          });
        }
        if (q.tag)
          filters.push({
            product: {
              tags: {
                some: {
                  tag: {
                    name: q.tag.normalize('NFC').toLocaleLowerCase('uk-UA'),
                  },
                },
              },
            },
          });
        if (q.valueIds)
          for (const valueId of q.valueIds)
            filters.push({
              OR: [
                { attributes: { some: { valueId } } },
                { product: { attributes: { some: { valueId } } } },
              ],
            });
        if (q.inStock)
          filters.push({
            balances:
              q.inStock === 'true'
                ? { some: { warehouseId: q.warehouseId, quantity: { gt: 0 } } }
                : { none: { warehouseId: q.warehouseId, quantity: { gt: 0 } } },
          });
        const where: Prisma.VariantWhereInput = { AND: filters };
        const rows = await tx.variant.findMany({
          where,
          skip,
          take: q.pageSize,
          orderBy: [{ sku: q.sort }, { id: q.sort }],
          include: {
            ...variantInclude,
            balances: { where: { warehouseId: q.warehouseId } },
          },
        });
        return {
          items: rows.map((v) => ({
            ...v,
            quantity: q.warehouseId
              ? (v.balances[0]?.quantity.toString() ?? '0')
              : undefined,
            revision: q.warehouseId
              ? (v.balances[0]?.revision ?? 0)
              : undefined,
            balances: undefined,
          })),
          total: await tx.variant.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
}
@Controller('admin/inventory')
@UseGuards(AdminGuard)
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly service: InventoryService,
  ) {}
  @Get('variants') variants(@Query() q: unknown) {
    return this.service.list('variants', q);
  }
  @Get('balances') balances(@Query() q: unknown) {
    return this.service.list('balances', q);
  }
  @Get('movements') movements(@Query() q: unknown) {
    return this.service.list('movements', q);
  }
  @Get('supplies') supplies(@Query() q: unknown) {
    return this.service.list('supplies', q);
  }
  @Get('supplies/:id') supply(@Param('id') id: string) {
    return this.service.supply(parse(uuid, id));
  }
  @Post('supplies') createSupply(@Body() b: unknown, @Req() r: AdminRequest) {
    return this.service.saveSupply(undefined, b, r.admin.id);
  }
  @Put('supplies/:id') updateSupply(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.saveSupply(parse(uuid, id), b, r.admin.id);
  }
  @Post('supplies/:id/receive') receive(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.receive(parse(uuid, id), b, r.admin.id);
  }
  @Get('counts') counts(@Query() q: unknown) {
    return this.service.list('counts', q);
  }
  @Get('counts/:id') count(@Param('id') id: string) {
    return this.service.count(parse(uuid, id));
  }
  @Post('counts') createCount(@Body() b: unknown, @Req() r: AdminRequest) {
    return this.service.saveCount(undefined, b, r.admin.id);
  }
  @Put('counts/:id') updateCount(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.saveCount(parse(uuid, id), b, r.admin.id);
  }
  @Post('counts/:id/start') start(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.start(parse(uuid, id), b, r.admin.id);
  }
  @Put('counts/:id/results') results(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.results(parse(uuid, id), b);
  }
  @Post('counts/:id/recount') recount(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.recount(parse(uuid, id), b);
  }
  @Post('counts/:id/post') post(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.finish(parse(uuid, id), b, r.admin.id, false);
  }
  @Post('counts/:id/cancel') cancel(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.finish(parse(uuid, id), b, r.admin.id, true);
  }
}
