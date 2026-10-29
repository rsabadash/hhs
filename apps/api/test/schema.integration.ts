import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'TEST_DATABASE_URL must identify an isolated migrated test database.',
  );
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000,
});
let client: PoolClient;
let hasClient = false;
let fixture: Awaited<ReturnType<typeof seed>>;

// Identifiers below come only from test code. Values are always parameters.
async function insert(table: string, data: Record<string, unknown>) {
  const id = randomUUID();
  const fields = { id, ...data };
  await client.query(
    `INSERT INTO "${table}" (${Object.keys(fields)
      .map((key) => `"${key}"`)
      .join(',')}) VALUES (${Object.keys(fields)
      .map((_, index) => `$${index + 1}`)
      .join(',')})`,
    Object.values(fields),
  );
  return id;
}
async function seed() {
  const actorId = await insert('Admin', {
    email: `${randomUUID()}@example.test`,
    passwordHash: 'fixture-only',
  });
  const categoryId = await insert('Category', { name: 'Фурнітура' });
  const unitId = await insert('Unit', { name: 'Штука', symbol: randomUUID() });
  const productId = await insert('Product', {
    name: 'Конектор',
    categoryId,
    updatedAt: new Date(),
  });
  const variantId = await insert('Variant', {
    name: 'Срібний',
    sku: randomUUID(),
    productId,
    unitId,
    updatedAt: new Date(),
  });
  const warehouseId = await insert('Warehouse', { name: randomUUID() });
  const supplierId = await insert('Supplier', { name: 'Постачальник' });
  const supplyId = await insert('Supply', {
    reference: randomUUID(),
    warehouseId,
    supplierId,
    createdById: actorId,
  });
  return {
    actorId,
    categoryId,
    unitId,
    productId,
    variantId,
    warehouseId,
    supplierId,
    supplyId,
  };
}
beforeEach(async () => {
  hasClient = false;
  client = await pool.connect();
  hasClient = true;
  await client.query('BEGIN');
  fixture = await seed();
});
afterEach(async () => {
  if (hasClient) {
    try {
      await client.query('ROLLBACK');
    } finally {
      // Discard interrupted connections, even if rollback itself fails.
      client.release(true);
      hasClient = false;
    }
  }
});
afterAll(async () => {
  await pool.end();
});

async function line(variantId = fixture.variantId) {
  return insert('SupplyItem', {
    supplyId: fixture.supplyId,
    warehouseId: fixture.warehouseId,
    variantId,
    quantity: '3.000',
    unitCost: '12.35',
    unitSymbol: 'шт',
  });
}
async function balance() {
  await client.query(
    'INSERT INTO "StockBalance" ("variantId", "warehouseId") VALUES ($1, $2)',
    [fixture.variantId, fixture.warehouseId],
  );
}

describe('initial migration constraints', () => {
  it('supports multiple SKUs in one supply and exact decimal purchase totals', async () => {
    await line();
    const variantId = await insert('Variant', {
      name: 'Золотий',
      sku: randomUUID(),
      productId: fixture.productId,
      unitId: fixture.unitId,
      updatedAt: new Date(),
    });
    await line(variantId);
    const result = await client.query(
      'SELECT count(*)::int AS count, sum(quantity * "unitCost") AS total FROM "SupplyItem" WHERE "supplyId" = $1',
      [fixture.supplyId],
    );
    expect(result.rows[0]).toEqual({ count: 2, total: '74.10000' });
  });
  it('rejects case-equivalent SKUs', async () => {
    await client.query('UPDATE "Variant" SET sku = $1 WHERE id = $2', [
      'SKU-ABC',
      fixture.variantId,
    ]);
    await expect(
      insert('Variant', {
        name: 'Duplicate',
        sku: ' sku-abc ',
        productId: fixture.productId,
        unitId: fixture.unitId,
        updatedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('rejects publishing without a price', async () => {
    await expect(
      client.query(
        'UPDATE "Variant" SET status = \'PUBLISHED\' WHERE id = $1',
        [fixture.variantId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects negative balances', async () => {
    await balance();
    await expect(
      client.query(
        'UPDATE "StockBalance" SET quantity = -1 WHERE "variantId" = $1',
        [fixture.variantId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects supply lines in a different warehouse from their document', async () => {
    const warehouseId = await insert('Warehouse', { name: randomUUID() });
    await expect(
      insert('SupplyItem', {
        supplyId: fixture.supplyId,
        warehouseId,
        variantId: fixture.variantId,
        quantity: 1,
        unitCost: 1,
        unitSymbol: 'шт',
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('rejects repeated receipt movements for one supply line', async () => {
    const supplyItemId = await line();
    await balance();
    const data = {
      supplyItemId,
      variantId: fixture.variantId,
      warehouseId: fixture.warehouseId,
      actorId: fixture.actorId,
      kind: 'RECEIPT',
      quantity: 3,
    };
    await insert('StockMovement', data);
    await expect(insert('StockMovement', data)).rejects.toMatchObject({
      code: '23505',
    });
  });
  it('rejects a receipt movement with the wrong sign', async () => {
    const supplyItemId = await line();
    await balance();
    await expect(
      insert('StockMovement', {
        supplyItemId,
        variantId: fixture.variantId,
        warehouseId: fixture.warehouseId,
        actorId: fixture.actorId,
        kind: 'RECEIPT',
        quantity: -3,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects images attached to another product’s variant', async () => {
    const productId = await insert('Product', {
      name: 'Інший товар',
      categoryId: fixture.categoryId,
      updatedAt: new Date(),
    });
    await expect(
      insert('Image', {
        productId,
        variantId: fixture.variantId,
        publicId: randomUUID(),
        url: 'https://example.test/image.webp',
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('keeps uncounted quantities distinct from an explicit zero', async () => {
    const countId = await insert('InventoryCount', {
      reference: randomUUID(),
      warehouseId: fixture.warehouseId,
      createdById: fixture.actorId,
    });
    const id = await insert('InventoryCountItem', {
      countId,
      warehouseId: fixture.warehouseId,
      variantId: fixture.variantId,
      expectedQuantity: 3,
      expectedRevision: 0,
    });
    expect(
      (
        await client.query(
          'SELECT "actualQuantity" FROM "InventoryCountItem" WHERE id = $1',
          [id],
        )
      ).rows[0].actualQuantity,
    ).toBeNull();
    await client.query(
      'UPDATE "InventoryCountItem" SET "actualQuantity" = 0 WHERE id = $1',
      [id],
    );
    expect(
      (
        await client.query(
          'SELECT "actualQuantity" FROM "InventoryCountItem" WHERE id = $1',
          [id],
        )
      ).rows[0].actualQuantity,
    ).toBe('0.000');
  });
});
