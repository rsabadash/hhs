import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../dist/db.js';
import { StorefrontService } from '../dist/storefront.js';

if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  process.env.BENCHMARK_CONFIRM !== 'isolated'
)
  throw new Error(
    'Set DATABASE_URL=TEST_DATABASE_URL to an isolated database and BENCHMARK_CONFIRM=isolated.',
  );
const db = new Database();
const service = new StorefrontService(db);
const marker = `benchmark-${randomUUID()}`;
const categoryId = randomUUID(),
  unitId = randomUUID(),
  attributeId = randomUUID();
const values = [4, 8].map((size) => ({
  id: randomUUID(),
  attributeId,
  label: String(size),
  numericValue: String(size),
}));
try {
  await db.category.create({ data: { id: categoryId, name: marker } });
  await db.unit.create({ data: { id: unitId, name: marker, symbol: marker } });
  await db.attribute.create({
    data: {
      id: attributeId,
      name: marker,
      kind: 'NUMBER',
      measurementSymbol: 'мм',
    },
  });
  await db.attributeValue.createMany({ data: values });
  const products = Array.from({ length: 1000 }, (_, n) => ({
    id: randomUUID(),
    name: `Перлини ${marker} ${n}`,
    categoryId,
    description: 'Матеріали для прикрас. '.repeat(20),
  }));
  await db.product.createMany({ data: products });
  const variants = products.flatMap((p, n) =>
    [4, 8].map((size) => ({
      id: randomUUID(),
      productId: p.id,
      sku: `${marker}-${n}-${size}`.toUpperCase(),
      name: `${size} мм`,
      unitId,
      status: 'PUBLISHED',
      sellPrice: String(10 + (n % 100)),
    })),
  );
  await db.variant.createMany({ data: variants });
  await db.variantAttributeValue.createMany({
    data: variants.map((v, index) => ({
      variantId: v.id,
      attributeId,
      valueId: values[index % 2].id,
    })),
  });
  for (const [label, query] of Object.entries({
    browse: { categoryId, pageSize: 24 },
    search: { q: marker, pageSize: 24 },
    price: { categoryId, minPrice: '30', maxPrice: '70', pageSize: 24 },
    attribute: { categoryId, valueIds: values[0].id, pageSize: 24 },
    lastPage: { categoryId, page: 42, pageSize: 24 },
  })) {
    const times = [];
    let bytes = 0,
      total = 0;
    for (let i = 0; i < 21; i++) {
      const start = performance.now();
      const result = await service.list(query);
      const elapsed = performance.now() - start;
      assert.equal(result.total, label === 'price' ? 410 : 1000);
      assert.equal(result.items.length, label === 'lastPage' ? 16 : 24);
      if (i === 0)
        console.log(
          JSON.stringify({
            scenario: label,
            firstQueryMs: Math.round(elapsed),
          }),
        );
      else times.push(elapsed);
      bytes = Buffer.byteLength(JSON.stringify(result));
      total = result.total;
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        scenario: label,
        samples: times.length,
        p50Ms: Math.round(times[9]),
        p95Ms: Math.round(times[18]),
        responseBytes: bytes,
        total,
      }),
    );
  }
} finally {
  await db.variant.deleteMany({ where: { product: { categoryId } } });
  await db.attributeValue.deleteMany({ where: { attributeId } });
  await db.attribute.deleteMany({ where: { id: attributeId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.unit.deleteMany({ where: { id: unitId } });
  await db.$disconnect();
}
