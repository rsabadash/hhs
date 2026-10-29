import { createHash, randomUUID } from 'node:crypto';
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Database } from './db.js';
import { InventoryService } from './inventory.js';
import { AdminGuard, type AdminRequest } from './auth.js';
import { Prisma } from './generated/prisma/client.js';
import { parse, uuid } from './validation.js';
import { stockDecimal as decimal } from './inventory-math.js';
import {
  cancelInput,
  fulfillInput,
  orderDraft,
  orderInput,
  orderLines,
  orderQuery,
} from './order-validation.js';
const actor = { select: { email: true } };
const include = {
  warehouse: true,
  createdBy: actor,
  fulfilledBy: actor,
  cancelledBy: actor,
  items: { orderBy: { sku: 'asc' as const } },
};
function view<
  T extends {
    items: { quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[];
  },
>(doc: T) {
  const items = doc.items.map((i) => ({
    ...i,
    total: decimal(i.quantity).times(i.unitPrice).toFixed(2),
  }));
  return {
    ...doc,
    items,
    total: items.reduce((s, i) => s.plus(i.total), decimal(0)).toFixed(2),
  };
}
@Injectable()
export class OrderService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}
  async detail(id: string) {
    const doc = await this.db.order.findUnique({ where: { id }, include });
    if (!doc) throw new NotFoundException('Замовлення не знайдено.');
    const { requestHash: _hash, ...safe } = doc;
    void _hash;
    return view(safe);
  }
  private async quote(
    tx: Prisma.TransactionClient,
    data: ReturnType<typeof orderDraft.parse>,
  ) {
    const warehouse = await tx.warehouse.findUnique({
      where: { id: data.warehouseId },
    });
    if (!warehouse) throw new BadRequestException('Склад не знайдено.');
    const lines = orderLines(data.items);
    const variants = await tx.variant.findMany({
      where: { id: { in: lines.map((i) => i.variantId) } },
      include: {
        unit: true,
        product: {
          include: {
            attributes: {
              include: { value: { include: { attribute: true } } },
            },
          },
        },
        attributes: { include: { value: { include: { attribute: true } } } },
        balances: { where: { warehouseId: data.warehouseId } },
      },
    });
    const items = lines.map((i) => {
      const v = variants.find((v) => v.id === i.variantId);
      if (
        !v ||
        v.archivedAt ||
        v.product.archivedAt ||
        !v.sellPrice ||
        !v.sellPrice.gt(0)
      )
        throw new BadRequestException(
          'SKU має бути активним і мати додатну ціну продажу.',
        );
      if (!v.unit.allowsFraction && !decimal(i.quantity).isInteger())
        throw new BadRequestException(
          `${v.sku}: одиниця допускає лише цілу кількість.`,
        );
      if (
        i.unitPrice !== undefined &&
        !decimal(i.unitPrice).equals(v.sellPrice)
      )
        throw new ConflictException(
          `${v.sku}: ціна змінилася. Перегляньте замовлення ще раз.`,
        );
      const available = decimal(v.balances[0]?.quantity || 0);
      if (available.lt(i.quantity))
        throw new ConflictException(
          `${v.sku}: недостатньо запасів на вибраному складі (доступно ${available} ${v.unit.symbol}).`,
        );
      const attributes = [...v.product.attributes, ...v.attributes]
        .map(
          (a) =>
            `${a.value.attribute.name}: ${a.value.label}${a.value.attribute.measurementSymbol || ''}`,
        )
        .join(' · ');
      return {
        variantId: v.id,
        sku: v.sku,
        name: [v.product.name, v.name, attributes].filter(Boolean).join(' · '),
        unitSymbol: v.unit.symbol,
        quantity: decimal(i.quantity),
        unitPrice: decimal(v.sellPrice),
        available: available.toString(),
        remaining: available.minus(i.quantity).toString(),
      };
    });
    return view({ warehouse, items });
  }
  async preview(input: unknown) {
    const data = parse(orderDraft, input);
    return this.db.$transaction((tx) => this.quote(tx, data), {
      isolationLevel: 'RepeatableRead',
    });
  }
  async create(input: unknown, adminId: string) {
    const data = parse(orderInput, input);
    const { requestKey, ...body } = data;
    body.items = orderLines(body.items);
    const hash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');
    const id = await this.inventory.write(async (tx) => {
      const old = await tx.order.findUnique({ where: { requestKey } });
      if (old) {
        if (old.requestHash !== hash)
          throw new ConflictException(
            'Цей ключ уже використано для іншого замовлення.',
          );
        return old.id;
      }
      const quote = await this.quote(tx, body);
      const doc = await tx.order.create({
        data: {
          requestKey,
          requestHash: hash,
          reference: `ORD-${randomUUID()}`,
          warehouseId: body.warehouseId,
          customerName: body.customerName,
          contact: body.contact,
          notes: body.notes,
          createdById: adminId,
          items: {
            createMany: {
              data: quote.items.map(
                ({
                  variantId,
                  sku,
                  name,
                  unitSymbol,
                  quantity,
                  unitPrice,
                }) => ({
                  variantId,
                  sku,
                  name,
                  unitSymbol,
                  quantity,
                  unitPrice,
                }),
              ),
            },
          },
        },
        include: { items: true },
      });
      await this.inventory.move(
        tx,
        body.warehouseId,
        doc.items.map((i) => ({
          variantId: i.variantId,
          quantity: decimal(i.quantity).negated(),
          kind: 'SALE',
          actorId: adminId,
          orderItemId: i.id,
        })),
      );
      return doc.id;
    });
    return this.detail(id);
  }
  async finish(
    id: string,
    action: 'fulfill' | 'cancel',
    input: unknown,
    adminId: string,
  ) {
    const reason =
      action === 'cancel'
        ? parse(cancelInput, input).reason
        : (parse(fulfillInput, input), '');
    await this.inventory.write(async (tx) => {
      const doc = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException('Замовлення не знайдено.');
      const status = action === 'cancel' ? 'CANCELLED' : 'FULFILLED';
      if (doc.status === status) return;
      if (doc.status !== 'CONFIRMED')
        throw new ConflictException(
          'Замовлення вже виконано або скасовано. Оновіть сторінку.',
        );
      if (action === 'cancel')
        await this.inventory.move(
          tx,
          doc.warehouseId,
          doc.items.map((i) => ({
            variantId: i.variantId,
            quantity: decimal(i.quantity),
            kind: 'CANCELLATION',
            actorId: adminId,
            orderItemId: i.id,
          })),
        );
      await tx.order.update({
        where: { id },
        data:
          action === 'cancel'
            ? {
                status,
                cancelledAt: new Date(),
                cancelledById: adminId,
                cancellationReason: reason,
              }
            : { status, fulfilledAt: new Date(), fulfilledById: adminId },
      });
    });
    return this.detail(id);
  }
  async list(input: unknown) {
    const q = parse(orderQuery, input);
    const contains = { contains: q.q, mode: 'insensitive' as const };
    const where: Prisma.OrderWhereInput = {
      warehouseId: q.warehouseId,
      status: q.status,
      createdAt: {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
        ...(q.to
          ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000) }
          : {}),
      },
      ...(q.q
        ? {
            OR: [
              { reference: contains },
              { customerName: contains },
              { contact: contains },
              {
                items: {
                  some: { OR: [{ sku: contains }, { name: contains }] },
                },
              },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        items: (
          await tx.order.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
            select: {
              id: true,
              reference: true,
              customerName: true,
              contact: true,
              status: true,
              createdAt: true,
              warehouse: { select: { name: true } },
              items: { select: { quantity: true, unitPrice: true } },
            },
          })
        ).map(view),
        total: await tx.order.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
@Controller('admin/orders')
@UseGuards(AdminGuard)
export class OrderController {
  constructor(@Inject(OrderService) private readonly service: OrderService) {}
  @Get() list(@Query() q: unknown) {
    return this.service.list(q);
  }
  @Post('preview') preview(@Body() b: unknown) {
    return this.service.preview(b);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.service.detail(parse(uuid, id));
  }
  @Post() create(@Body() b: unknown, @Req() r: AdminRequest) {
    return this.service.create(b, r.admin.id);
  }
  @Post(':id/fulfill') fulfill(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.finish(parse(uuid, id), 'fulfill', b, r.admin.id);
  }
  @Post(':id/cancel') cancel(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.service.finish(parse(uuid, id), 'cancel', b, r.admin.id);
  }
}
