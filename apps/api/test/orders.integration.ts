import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { Database } from '../src/db.js';
import { InventoryService } from '../src/inventory.js';
import { OrderService } from '../src/orders.js';
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw Error('Isolated DATABASE_URL=TEST_DATABASE_URL required.');
const db = new Database(),
  inventory = new InventoryService(db),
  service = new OrderService(db, inventory),
  marker = `m6-${randomUUID()}`;
let adminId: string,
  warehouse: string,
  otherWarehouse: string,
  category: string,
  unit: string,
  fractional: string,
  product: string,
  first: string,
  second: string,
  api: ChildProcess,
  cookie: string;
const stock = async (variantId = first, warehouseId = warehouse) =>
  (await db.stockBalance.findUnique({
    where: { variantId_warehouseId: { variantId, warehouseId } },
  }))!.quantity.toString();
const draft = (quantity = '1', variantId = first) => ({
  requestKey: randomUUID(),
  warehouseId: warehouse,
  customerName: 'Ірина',
  contact: `@${marker}`,
  notes: 'Instagram',
  items: [
    { variantId, quantity, unitPrice: variantId === first ? '12.50' : '0.10' },
  ],
});
beforeAll(async () => {
  adminId = (
    await db.admin.create({
      data: { email: `${marker}@example.test`, passwordHash: 'unused' },
    })
  ).id;
  warehouse = (await db.warehouse.create({ data: { name: marker } })).id;
  otherWarehouse = (
    await db.warehouse.create({ data: { name: `${marker}-other` } })
  ).id;
  category = (await db.category.create({ data: { name: marker } })).id;
  unit = (await db.unit.create({ data: { name: marker, symbol: marker } })).id;
  fractional = (
    await db.unit.create({
      data: {
        name: `${marker}-m`,
        symbol: `${marker}-m`,
        allowsFraction: true,
      },
    })
  ).id;
  const p = await db.product.create({
    data: {
      name: `Перлини ${marker}`,
      categoryId: category,
      variants: {
        create: [
          {
            sku: `${marker}-A`,
            name: 'Нитка',
            unitId: unit,
            sellPrice: '12.50',
            status: 'PUBLISHED',
          },
          {
            sku: `${marker}-B`,
            name: 'Метр',
            unitId: fractional,
            sellPrice: '0.10',
          },
        ],
      },
    },
    include: { variants: true },
  });
  product = p.id;
  first = p.variants.find((v) => v.sku.endsWith('-A'))!.id;
  second = p.variants.find((v) => v.sku.endsWith('-B'))!.id;
  await db.stockBalance.createMany({
    data: [
      { variantId: first, warehouseId: warehouse, quantity: '10' },
      { variantId: second, warehouseId: warehouse, quantity: '10' },
      { variantId: first, warehouseId: otherWarehouse, quantity: '10' },
    ],
  });
  const token = randomUUID().replaceAll('-', '').repeat(2);
  cookie = `hhs_session=${token}`;
  await db.session.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      adminId,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...process.env, PORT: '4105', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let n = 0; n < 60; n++) {
    if (
      await fetch('http://127.0.0.1:4105/health/ready')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
}, 30000);
afterAll(async () => {
  api?.kill();
  await db.stockMovement.deleteMany({ where: { actorId: adminId } });
  await db.orderItem.deleteMany({ where: { order: { createdById: adminId } } });
  await db.order.deleteMany({ where: { createdById: adminId } });
  await db.inventoryCountItem.deleteMany({
    where: { count: { createdById: adminId } },
  });
  await db.inventoryCount.deleteMany({ where: { createdById: adminId } });
  await db.stockBalance.deleteMany({
    where: { warehouseId: { in: [warehouse, otherWarehouse] } },
  });
  await db.variant.deleteMany({ where: { productId: product } });
  await db.product.delete({ where: { id: product } });
  await db.unit.deleteMany({ where: { id: { in: [unit, fractional] } } });
  await db.category.delete({ where: { id: category } });
  await db.warehouse.deleteMany({
    where: { id: { in: [warehouse, otherWarehouse] } },
  });
  await db.admin.delete({ where: { id: adminId } });
  await db.$disconnect();
}, 30000);
describe('manual orders', () => {
  it('protects all HTTP actions with auth, CSRF and validation', async () => {
    const url = 'http://127.0.0.1:4105/admin/orders';
    expect((await fetch(url)).status).toBe(401);
    expect(
      (
        await fetch(url, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(url, {
          method: 'POST',
          headers: {
            cookie,
            'content-type': 'application/json',
            'x-hhs-csrf': '1',
          },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (await fetch(`${url}?status=DRAFT`, { headers: { cookie } })).status,
    ).toBe(400);
  });
  it('previews without writing, combines duplicate SKUs and retries exactly once', async () => {
    const body = draft();
    body.items.push({ ...body.items[0], quantity: '2', unitPrice: '12.5' });
    const { requestKey: _key, ...input } = body;
    void _key;
    const quote = await service.preview(input);
    expect(quote.total).toBe('37.50');
    expect(quote.items[0].remaining).toBe('7');
    expect(await stock()).toBe('10');
    const [a, b] = await Promise.all([
      service.create(body, adminId),
      service.create(
        { ...body, items: [{ ...body.items[0], quantity: '3' }] },
        adminId,
      ),
    ]);
    expect(a.id).toBe(b.id);
    expect(await stock()).toBe('7');
    expect(await stock(first, otherWarehouse)).toBe('10');
    expect(
      await db.stockMovement.count({
        where: { orderItem: { orderId: a.id }, kind: 'SALE' },
      }),
    ).toBe(1);
    await expect(
      service.create({ ...body, contact: 'changed' }, adminId),
    ).rejects.toThrow('ключ');
    await service.finish(a.id, 'cancel', { reason: 'Помилка' }, adminId);
    await service.finish(a.id, 'cancel', { reason: 'Повтор' }, adminId);
    expect(await stock()).toBe('10');
    expect((await service.detail(a.id)).cancellationReason).toBe('Помилка');
    expect(
      await db.stockMovement.count({
        where: { orderItem: { orderId: a.id }, kind: 'CANCELLATION' },
      }),
    ).toBe(1);
  }, 60000);
  it('rolls back all lines on shortages and rejects fractional whole units or stale prices', async () => {
    const count = await db.order.count({ where: { createdById: adminId } });
    const body = draft();
    body.items.push({ variantId: second, quantity: '11', unitPrice: '0.10' });
    await expect(service.create(body, adminId)).rejects.toThrow('недостатньо');
    expect(await stock()).toBe('10');
    expect(await stock(second)).toBe('10');
    expect(await db.order.count({ where: { createdById: adminId } })).toBe(
      count,
    );
    await expect(service.create(draft('0.5'), adminId)).rejects.toThrow('цілу');
    const stale = draft();
    stale.items[0].unitPrice = '11';
    await expect(service.create(stale, adminId)).rejects.toThrow('ціна');
  }, 30000);
  it('concurrent orders cannot oversell; fulfillment neither deducts again nor permits cancellation', async () => {
    const results = await Promise.allSettled([
      service.create(draft('7'), adminId),
      service.create(draft('7'), adminId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe('3');
    const win = results.find((r) => r.status === 'fulfilled')!;
    if (win.status !== 'fulfilled') throw Error('No winner');
    await service.finish(win.value.id, 'fulfill', {}, adminId);
    await service.finish(win.value.id, 'fulfill', {}, adminId);
    expect(await stock()).toBe('3');
    await expect(
      service.finish(win.value.id, 'cancel', { reason: 'Too late' }, adminId),
    ).rejects.toThrow('виконано');
  }, 60000);
  it('keeps historical names, units and prices; cancellation works after archiving', async () => {
    const body = draft('1.125', second),
      doc = await service.create(body, adminId);
    expect(doc.total).toBe('0.11');
    await db.variant.update({
      where: { id: second },
      data: {
        name: 'Changed',
        sku: `${marker}-changed`,
        sellPrice: '50',
        archivedAt: new Date(),
      },
    });
    await db.unit.update({
      where: { id: fractional },
      data: { symbol: `${marker}-changed` },
    });
    const retry = await service.create(body, adminId);
    expect(retry.items[0].name).toBe(doc.items[0].name);
    expect(retry.items[0].unitSymbol).toBe(doc.items[0].unitSymbol);
    expect(retry.total).toBe('0.11');
    await expect(service.create(draft('1', second), adminId)).rejects.toThrow(
      'активним',
    );
    await service.finish(doc.id, 'cancel', { reason: 'Не потрібно' }, adminId);
    expect(await stock(second)).toBe('10');
    const search = await service.list({
      q: doc.items[0].sku,
      status: 'CANCELLED',
      warehouseId: warehouse,
    });
    expect(search.items.some((i) => i.id === doc.id)).toBe(true);
    expect(
      (await service.list({ q: doc.reference, warehouseId: otherWarehouse }))
        .total,
    ).toBe(0);
  }, 60000);
  it('invalidates active inventory counts and exposes sold-out stock publicly', async () => {
    const count = await inventory.saveCount(
      undefined,
      {
        reference: `COUNT-${marker}`,
        warehouseId: warehouse,
        items: [{ variantId: first }],
      },
      adminId,
    );
    const started = await inventory.start(
      count.id,
      { revision: count.revision },
      adminId,
    );
    const body = draft('3');
    const doc = await service.create(body, adminId);
    expect((await inventory.count(count.id)).items[0].stale).toBe(true);
    const saved = await inventory.results(count.id, {
      revision: started.revision,
      items: [
        {
          variantId: first,
          actualQuantity: '3',
          reason: 'Підрахунок',
          excluded: false,
        },
      ],
    });
    await expect(
      inventory.finish(count.id, { revision: saved.revision }, adminId, false),
    ).rejects.toThrow('залишок змінився');
    // Stock in another warehouse remains visible until that warehouse sells out.
    const other = await service.create(
      { ...draft('10'), warehouseId: otherWarehouse },
      adminId,
    );
    const publicProduct = await fetch(
      `http://127.0.0.1:4105/catalog/${product}`,
    ).then((r) => r.json());
    expect(
      publicProduct.variants.find((v: { sku: string }) => v.sku.endsWith('-A'))
        .inStock,
    ).toBe(false);
    await service.finish(
      doc.id,
      'cancel',
      { reason: 'Повернення до виконання' },
      adminId,
    );
    const restored = await fetch(
      `http://127.0.0.1:4105/catalog/${product}`,
    ).then((r) => r.json());
    expect(restored.variants[0].inStock).toBe(true);
    await service.finish(
      other.id,
      'cancel',
      { reason: 'Перевірка завершена' },
      adminId,
    );
  }, 60000);
  it('serializes fulfillment against cancellation', async () => {
    const doc = await service.create(draft(), adminId),
      before = await stock();
    const results = await Promise.allSettled([
      service.finish(doc.id, 'fulfill', {}, adminId),
      service.finish(doc.id, 'cancel', { reason: 'Скасувати' }, adminId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const final = await service.detail(doc.id);
    expect(await stock()).toBe(
      final.status === 'CANCELLED' ? String(Number(before) + 1) : before,
    );
    expect(final.fulfilledBy?.email || final.cancelledBy?.email).toBe(
      `${marker}@example.test`,
    );
  }, 30000);
  it('rolls back the saved order and ledger if a later stock operation fails', async () => {
    const before = await stock();
    const body = draft();
    const move = inventory.move.bind(inventory);
    const injected = vi
      .spyOn(inventory, 'move')
      .mockImplementationOnce(async (...args) => {
        await move(...args);
        throw new Error('Simulated failure after movement');
      });
    try {
      await expect(service.create(body, adminId)).rejects.toThrow(
        'Simulated failure',
      );
      expect(await stock()).toBe(before);
      expect(
        await db.order.findUnique({ where: { requestKey: body.requestKey } }),
      ).toBeNull();
    } finally {
      injected.mockRestore();
    }
    const retry = await service.create(body, adminId);
    await service.finish(
      retry.id,
      'cancel',
      { reason: 'Test rollback' },
      adminId,
    );
    expect(await stock()).toBe(before);
  }, 30000);
  it('creates and cancels 100 distinct SKU lines atomically', async () => {
    const variants = Array.from({ length: 100 }, (_, n) => ({
      id: randomUUID(),
      sku: `${marker}-bulk-${n}`,
      name: `${n}`,
      unitId: unit,
      productId: product,
      sellPrice: '1',
    }));
    await db.variant.createMany({ data: variants });
    await db.stockBalance.createMany({
      data: variants.map((v) => ({
        variantId: v.id,
        warehouseId: warehouse,
        quantity: '1',
      })),
    });
    const doc = await service.create(
      {
        ...draft(),
        items: variants.map((v) => ({
          variantId: v.id,
          quantity: '1',
          unitPrice: '1',
        })),
      },
      adminId,
    );
    expect(doc.total).toBe('100.00');
    expect(doc.items).toHaveLength(100);
    expect(
      await db.stockBalance.count({
        where: {
          warehouseId: warehouse,
          variantId: { in: variants.map((v) => v.id) },
          quantity: 0,
        },
      }),
    ).toBe(100);
    await Promise.all([
      service.finish(doc.id, 'cancel', { reason: 'Bulk test' }, adminId),
      service.finish(doc.id, 'cancel', { reason: 'Bulk test' }, adminId),
    ]);
    expect(
      await db.stockBalance.count({
        where: {
          warehouseId: warehouse,
          variantId: { in: variants.map((v) => v.id) },
          quantity: 1,
        },
      }),
    ).toBe(100);
    expect(
      await db.stockMovement.count({
        where: { orderItem: { orderId: doc.id }, kind: 'CANCELLATION' },
      }),
    ).toBe(100);
  }, 60000);
});
