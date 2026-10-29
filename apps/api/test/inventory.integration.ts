import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { Database } from '../src/db.js';
import { InventoryService } from '../src/inventory.js';
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw Error('Isolated DATABASE_URL=TEST_DATABASE_URL required.');
const db = new Database(),
  service = new InventoryService(db),
  marker = `m4-${randomUUID()}`;
let adminId: string,
  warehouse: string,
  otherWarehouse: string,
  supplier: string,
  category: string,
  unit: string,
  fractional: string,
  product: string,
  first: string,
  second: string,
  api: ChildProcess,
  cookie: string;
const stock = async (v = first, w = warehouse) =>
  (
    await db.stockBalance.findUnique({
      where: { variantId_warehouseId: { variantId: v, warehouseId: w } },
    })
  )?.quantity.toString() || '0';
const draft = (
  items = [
    { variantId: first, quantity: '5', unitCost: '2.50' },
    { variantId: second, quantity: '1.125', unitCost: '0.10' },
  ],
  w = warehouse,
) =>
  service.saveSupply(
    undefined,
    {
      reference: `${marker}-${randomUUID()}`,
      warehouseId: w,
      supplierId: supplier,
      items,
    },
    adminId,
  );
const count = () =>
  service.saveCount(
    undefined,
    {
      reference: `${marker}-${randomUUID()}`,
      warehouseId: warehouse,
      items: [{ variantId: first }, { variantId: second }],
    },
    adminId,
  );
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
  supplier = (await db.supplier.create({ data: { name: marker } })).id;
  category = (await db.category.create({ data: { name: marker } })).id;
  unit = (
    await db.unit.create({ data: { name: marker, symbol: `${marker}-pc` } })
  ).id;
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
          { sku: `${marker}-A`, name: 'Штука', unitId: unit },
          { sku: `${marker}-B`, name: 'Метр', unitId: fractional },
        ],
      },
    },
    include: { variants: true },
  });
  product = p.id;
  first = p.variants.find((v) => v.sku.endsWith('-A'))!.id;
  second = p.variants.find((v) => v.sku.endsWith('-B'))!.id;
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
    env: { ...process.env, PORT: '4103', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let n = 0; n < 60; n++) {
    if (
      await fetch('http://127.0.0.1:4103/health/ready')
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
  await db.inventoryCountItem.deleteMany({
    where: { count: { createdById: adminId } },
  });
  await db.inventoryCount.deleteMany({ where: { createdById: adminId } });
  await db.supply.deleteMany({ where: { createdById: adminId } });
  await db.stockBalance.deleteMany({
    where: { warehouseId: { in: [warehouse, otherWarehouse] } },
  });
  if (product) {
    await db.variant.deleteMany({ where: { productId: product } });
    await db.product.delete({ where: { id: product } });
  }
  await db.unit.deleteMany({ where: { id: { in: [unit, fractional] } } });
  await db.category.delete({ where: { id: category } });
  await db.supplier.delete({ where: { id: supplier } });
  await db.warehouse.deleteMany({
    where: { id: { in: [warehouse, otherWarehouse] } },
  });
  await db.admin.delete({ where: { id: adminId } });
  await db.$disconnect();
}, 30000);
describe('supplies and reconciliation', () => {
  it('requires authentication and CSRF for inventory writes', async () => {
    const url = 'http://127.0.0.1:4103/admin/inventory/supplies';
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
  });
  it('keeps drafts stock-neutral and receives multiple units atomically exactly once under concurrent retries', async () => {
    const d = await draft();
    expect(await stock()).toBe('0');
    expect(d.total).toBe('12.61');
    await Promise.all([
      service.receive(d.id, { revision: d.revision }, adminId),
      service.receive(d.id, { revision: d.revision }, adminId),
    ]);
    expect(await stock()).toBe('5');
    expect(await stock(second)).toBe('1.125');
    expect(await stock(first, otherWarehouse)).toBe('0');
    expect(
      await db.stockMovement.count({
        where: { supplyItem: { supplyId: d.id } },
      }),
    ).toBe(2);
    await expect(
      service.saveSupply(
        d.id,
        {
          reference: d.reference,
          warehouseId: warehouse,
          supplierId: supplier,
          revision: 1,
          items: [{ variantId: first, quantity: '2', unitCost: '1' }],
        },
        adminId,
      ),
    ).rejects.toThrow('не можна редагувати');
  });
  it('rolls back the complete receipt when one archived or fractional line is invalid', async () => {
    await expect(
      draft([{ variantId: first, quantity: '0.5', unitCost: '1' }]),
    ).rejects.toThrow('цілу');
    const before = await stock();
    const d = await draft();
    await db.variant.update({
      where: { id: second },
      data: { archivedAt: new Date() },
    });
    await expect(
      service.receive(d.id, { revision: d.revision }, adminId),
    ).rejects.toThrow('Архівний');
    expect(await stock()).toBe(before);
    expect((await service.supply(d.id)).status).toBe('DRAFT');
    expect(
      await db.stockMovement.count({
        where: { supplyItem: { supplyId: d.id } },
      }),
    ).toBe(0);
    await db.variant.update({
      where: { id: second },
      data: { archivedAt: null },
    });
  });
  it('rejects stale draft edits and stale receive actions', async () => {
    const d = await draft();
    const body = {
      reference: d.reference,
      warehouseId: warehouse,
      supplierId: supplier,
      revision: d.revision,
      items: [{ variantId: first, quantity: '2', unitCost: '1' }],
    };
    await service.saveSupply(d.id, body, adminId);
    await expect(service.saveSupply(d.id, body, adminId)).rejects.toThrow(
      'змінився',
    );
    await expect(
      service.receive(d.id, { revision: d.revision }, adminId),
    ).rejects.toThrow('змінився');
  });
  it('requires counts and discrepancy reasons, posts once, and preserves unscoped warehouses', async () => {
    let d = await count();
    d = await service.start(d.id, { revision: d.revision }, adminId);
    await expect(
      service.finish(d.id, { revision: d.revision }, adminId, false),
    ).rejects.toThrow('фактичну');
    d = await service.results(d.id, {
      revision: d.revision,
      items: d.items.map((i) => ({
        variantId: i.variantId,
        actualQuantity:
          i.variantId === first ? '3' : i.expectedQuantity.toString(),
        reason: '',
      })),
    });
    await expect(
      service.finish(d.id, { revision: d.revision }, adminId, false),
    ).rejects.toThrow('розбіжність');
    d = await service.results(d.id, {
      revision: d.revision,
      items: d.items.map((i) => ({
        variantId: i.variantId,
        actualQuantity: i.actualQuantity!.toString(),
        reason: 'Перераховано',
      })),
    });
    await Promise.all([
      service.finish(d.id, { revision: d.revision }, adminId, false),
      service.finish(d.id, { revision: d.revision }, adminId, false),
    ]);
    expect(await stock()).toBe('3');
    expect(await stock(second)).toBe('1.125');
    expect(await stock(first, otherWarehouse)).toBe('0');
    expect(
      await db.stockMovement.count({ where: { countItem: { countId: d.id } } }),
    ).toBe(1);
    await expect(
      service.finish(d.id, { revision: d.revision + 1 }, adminId, true),
    ).rejects.toThrow('не можна скасувати');
  }, 30000);
  it('blocks stale snapshots, clears counts on recount, and accepts explicit zero while excluding other lines', async () => {
    let d = await count();
    d = await service.start(d.id, { revision: d.revision }, adminId);
    d = await service.results(d.id, {
      revision: d.revision,
      items: d.items.map((i) => ({
        variantId: i.variantId,
        actualQuantity: '0',
        reason: 'Немає',
        excluded: i.variantId === second,
      })),
    });
    const s = await draft();
    await service.receive(s.id, { revision: s.revision }, adminId);
    const before = await stock();
    await expect(
      service.finish(d.id, { revision: d.revision }, adminId, false),
    ).rejects.toThrow('залишок змінився');
    expect(await stock()).toBe(before);
    d = await service.recount(d.id, { revision: d.revision, variantId: first });
    expect(
      d.items.find((i) => i.variantId === first)?.actualQuantity,
    ).toBeNull();
    d = await service.results(d.id, {
      revision: d.revision,
      items: d.items.map((i) => ({
        variantId: i.variantId,
        actualQuantity: '0',
        reason: 'Перераховано, відсутнє',
        excluded: i.variantId === second,
      })),
    });
    await service.finish(d.id, { revision: d.revision }, adminId, false);
    expect(await stock()).toBe('0');
    expect(await stock(second)).toBe('2.25');
  }, 30000);
  it('allows only one competing reconciliation and never overwrites a newer balance', async () => {
    const a = await count(),
      b = await count();
    const startedA = await service.start(a.id, { revision: 0 }, adminId),
      startedB = await service.start(b.id, { revision: 0 }, adminId);
    const save = (d: typeof startedA) =>
      service.results(d.id, {
        revision: d.revision,
        items: d.items.map((i) => ({
          variantId: i.variantId,
          actualQuantity: '2',
          reason: 'Підрахунок',
          excluded: i.variantId === second,
        })),
      });
    const [ca, cb] = await Promise.all([save(startedA), save(startedB)]);
    const result = await Promise.allSettled([
      service.finish(ca.id, { revision: ca.revision }, adminId, false),
      service.finish(cb.id, { revision: cb.revision }, adminId, false),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe('2');
  }, 30000);
  it('cancels without movement and supports Ukrainian/SKU/document filters, zero balances and pagination', async () => {
    const d = await count();
    const before = await stock();
    await service.finish(d.id, { revision: d.revision }, adminId, true);
    expect(await stock()).toBe(before);
    expect(
      (
        await service.list('supplies', {
          q: `${marker}-A`,
          supplierId: supplier,
          warehouseId: warehouse,
          status: 'RECEIVED',
        })
      ).total,
    ).toBeGreaterThan(0);
    expect(
      (
        await service.list('movements', {
          q: marker,
          warehouseId: warehouse,
          kind: 'COUNT',
        })
      ).total,
    ).toBe(3);
    const zero = await service.list('balances', {
      q: 'Перлини',
      warehouseId: otherWarehouse,
      categoryId: category,
      inStock: 'false',
      pageSize: 1,
    });
    expect(zero.total).toBe(2);
    expect(zero.items).toHaveLength(1);
    const other = await service.list('balances', {
      q: 'Перлини',
      warehouseId: otherWarehouse,
      categoryId: category,
      inStock: 'false',
      pageSize: 1,
      page: 2,
    });
    expect(other.items[0].id).not.toBe(zero.items[0].id);
  });
  it('receives and reconciles the supported maximum of 100 lines in bounded transactions', async () => {
    const ids = Array.from({ length: 100 }, () => randomUUID());
    await db.variant.createMany({
      data: ids.map((id, index) => ({
        id,
        productId: product,
        sku: `${marker}-BULK-${index}`,
        name: `Bulk ${index}`,
        unitId: unit,
      })),
    });
    const d = await draft(
      ids.map((variantId) => ({ variantId, quantity: '1', unitCost: '1' })),
    );
    await service.receive(d.id, { revision: d.revision }, adminId);
    expect(
      await db.stockMovement.count({
        where: { supplyItem: { supplyId: d.id } },
      }),
    ).toBe(100);
    let c = await service.saveCount(
      undefined,
      {
        reference: `${marker}-bulk`,
        warehouseId: warehouse,
        items: ids.map((variantId) => ({ variantId })),
      },
      adminId,
    );
    c = await service.start(c.id, { revision: c.revision }, adminId);
    c = await service.results(c.id, {
      revision: c.revision,
      items: ids.map((variantId) => ({
        variantId,
        actualQuantity: '0',
        reason: 'Підрахунок',
      })),
    });
    await service.finish(c.id, { revision: c.revision }, adminId, false);
    expect(
      await db.stockMovement.count({ where: { countItem: { countId: c.id } } }),
    ).toBe(100);
    expect(
      await db.stockBalance.count({
        where: { warehouseId: warehouse, variantId: { in: ids }, quantity: 0 },
      }),
    ).toBe(100);
  }, 60000);
});
