import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Database } from '../src/db.js';
import { StorefrontService } from '../src/storefront.js';
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw Error('Isolated DATABASE_URL=TEST_DATABASE_URL required.');
const db = new Database();
const service = new StorefrontService(db);
const marker = `m5-${randomUUID()}`;
let api: ChildProcess;
let parent: string,
  child: string,
  hiddenCategory: string,
  unit: string,
  warehouse: string;
let diameter: string, coating: string, shared: string;
let small: string,
  large: string,
  gold: string,
  silver: string,
  pearl: string,
  secretValue: string;
let product: string, hidden: string, archived: string;
let a: string, b: string, draft: string;
const base = 'http://127.0.0.1:4104/catalog';
beforeAll(async () => {
  parent = (await db.category.create({ data: { name: marker } })).id;
  child = (
    await db.category.create({
      data: { name: `${marker}-child`, parentId: parent },
    })
  ).id;
  hiddenCategory = (
    await db.category.create({ data: { name: `${marker}-secret` } })
  ).id;
  unit = (await db.unit.create({ data: { name: marker, symbol: marker } })).id;
  warehouse = (
    await db.warehouse.create({
      data: { name: marker, address: 'PRIVATE ADDRESS' },
    })
  ).id;
  for (const name of ['diameter', 'coating', 'shared']) {
    const attr = await db.attribute.create({
      data: { name: `${marker}-${name}`, kind: 'CHOICE' },
    });
    if (name === 'diameter') diameter = attr.id;
    if (name === 'coating') coating = attr.id;
    if (name === 'shared') shared = attr.id;
  }
  const value = async (attributeId: string, label: string) =>
    (await db.attributeValue.create({ data: { attributeId, label } })).id;
  small = await value(diameter, '4');
  large = await value(diameter, '8');
  gold = await value(coating, 'Золото');
  silver = await value(coating, 'Срібло');
  secretValue = await value(coating, 'PRIVATE VALUE');
  pearl = await value(shared, 'Перлини');
  product = (
    await db.product.create({
      data: {
        name: `${marker} Перлини`,
        categoryId: child,
        description: 'Публічний опис',
        attributes: { create: { attributeId: shared, valueId: pearl } },
        tags: { create: { tag: { create: { name: marker } } } },
      },
    })
  ).id;
  const variant = async (
    suffix: string,
    price: string,
    status: 'PUBLISHED' | 'DRAFT',
    values: { attributeId: string; valueId: string }[],
    archivedAt: Date | null = null,
  ) =>
    (
      await db.variant.create({
        data: {
          productId: product,
          name: suffix,
          sku: `${marker}-${suffix}`,
          unitId: unit,
          status,
          sellPrice: price,
          archivedAt,
          attributes: { create: values },
        },
      })
    ).id;
  a = await variant('A', '10.00', 'PUBLISHED', [
    { attributeId: diameter, valueId: small },
    { attributeId: coating, valueId: gold },
  ]);
  b = await variant('B', '100.00', 'PUBLISHED', [
    { attributeId: diameter, valueId: large },
    { attributeId: coating, valueId: silver },
  ]);
  draft = await variant('SECRET', '1.00', 'DRAFT', [
    { attributeId: coating, valueId: secretValue },
  ]);
  await variant('RETIRED', '2.00', 'DRAFT', [], new Date());
  await db.stockBalance.create({
    data: { variantId: b, warehouseId: warehouse, quantity: '3' },
  });
  await db.stockBalance.create({
    data: { variantId: draft, warehouseId: warehouse, quantity: '99' },
  });
  for (const [suffix, variantId] of [
    ['shared', null],
    ['public', b],
    ['private', draft],
  ] as const)
    await db.image.create({
      data: {
        productId: product,
        variantId,
        url: `https://res.cloudinary.com/demo/image/upload/${suffix}.jpg`,
        alt: suffix,
        publicId: `${marker}-${suffix}`,
      },
    });
  hidden = (
    await db.product.create({
      data: {
        name: `${marker} HIDDEN`,
        categoryId: hiddenCategory,
        tags: { create: { tag: { create: { name: `${marker}-secret` } } } },
        variants: {
          create: { name: 'hidden', sku: `${marker}-HIDDEN`, unitId: unit },
        },
      },
    })
  ).id;
  archived = (
    await db.product.create({
      data: {
        name: `${marker} ARCHIVED`,
        categoryId: hiddenCategory,
        archivedAt: new Date(),
        variants: {
          create: {
            name: 'archived',
            sku: `${marker}-ARCHIVED`,
            unitId: unit,
            status: 'PUBLISHED',
            sellPrice: '10',
          },
        },
      },
    })
  ).id;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...process.env, PORT: '4104' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    if (
      await fetch('http://127.0.0.1:4104/health/live')
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('Public API did not start');
}, 60000);
afterAll(async () => {
  api?.kill();
  const products = [product, hidden, archived].filter(Boolean);
  await db.image.deleteMany({ where: { productId: { in: products } } });
  await db.stockBalance.deleteMany({ where: { warehouseId: warehouse } });
  await db.variant.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.tag.deleteMany({ where: { name: { startsWith: marker } } });
  await db.attributeValue.deleteMany({
    where: { attributeId: { in: [diameter, coating, shared].filter(Boolean) } },
  });
  await db.attribute.deleteMany({ where: { name: { startsWith: marker } } });
  await db.warehouse.deleteMany({ where: { name: marker } });
  await db.unit.deleteMany({ where: { name: marker } });
  await db.category.deleteMany({
    where: { id: { in: [child, hiddenCategory].filter(Boolean) } },
  });
  await db.category.deleteMany({ where: { id: parent } });
  await db.$disconnect();
}, 30000);
describe('public catalog', () => {
  it('allows anonymous reads with explicit safe fields and visible images only', async () => {
    const response = await fetch(`${base}/${product}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data.variants.map((v: { id: string }) => v.id)).toEqual([a, b]);
    expect(Object.keys(data).sort()).toEqual(
      [
        'id',
        'name',
        'description',
        'category',
        'tags',
        'attributes',
        'images',
        'variants',
      ].sort(),
    );
    expect(Object.keys(data.variants[0]).sort()).toEqual(
      [
        'id',
        'name',
        'sku',
        'price',
        'unit',
        'inStock',
        'attributes',
        'images',
      ].sort(),
    );
    const serialized = JSON.stringify(data);
    for (const forbidden of [
      'PRIVATE',
      'SECRET',
      'RETIRED',
      'private.jpg',
      'publicId',
      'warehouseId',
      'quantity',
      'unitCost',
      'passwordHash',
      'archivedAt',
      'createdBy',
    ])
      expect(serialized).not.toContain(forbidden);
    expect(data.variants[0].images[0].alt).toBe('shared');
    expect(data.variants[1].images[0].alt).toBe('public');
  });
  it('hides drafts, archived parents and unpublished-only products even by direct URL or SKU', async () => {
    for (const id of [hidden, archived, randomUUID()])
      expect((await fetch(`${base}/${id}`)).status).toBe(404);
    for (const q of [
      `${marker}-SECRET`,
      `${marker}-RETIRED`,
      `${marker}-HIDDEN`,
      `${marker}-ARCHIVED`,
    ])
      expect((await service.list({ q })).total).toBe(0);
  });
  it('matches search, price, availability and attributes on one published variant', async () => {
    for (const filter of [
      { minPrice: '50', valueIds: small },
      { maxPrice: '50', inStock: 'true' },
      { valueIds: `${small},${silver}` },
      { q: `${marker}-A`, inStock: 'true' },
      { q: `${marker}-B`, maxPrice: '50' },
      { valueIds: secretValue },
    ])
      expect((await service.list({ q: marker, ...filter })).total).toBe(0);
    const result = await service.list({
      q: `${marker}-B`,
      categoryId: parent,
      minPrice: '50',
      inStock: 'true',
      valueIds: `${large},${silver},${pearl}`,
      tag: marker,
    });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      variantId: b,
      price: '100.00',
      inStock: true,
    });
  });
  it('keeps sold-out SKUs visible and reflects publication and stock changes immediately', async () => {
    const list = await service.list({ q: marker, inStock: 'false' });
    expect(list.items[0]).toMatchObject({
      variantId: a,
      price: '10.00',
      inStock: false,
    });
    await db.variant.update({ where: { id: a }, data: { status: 'DRAFT' } });
    expect((await service.get(product)).variants.map((v) => v.id)).toEqual([b]);
    await db.stockBalance.update({
      where: {
        variantId_warehouseId: { variantId: b, warehouseId: warehouse },
      },
      data: { quantity: '0' },
    });
    expect((await service.list({ q: marker, inStock: 'true' })).total).toBe(0);
    expect((await service.get(product)).variants[0].inStock).toBe(false);
    await db.variant.update({
      where: { id: a },
      data: { status: 'PUBLISHED' },
    });
  });
  it('only exposes filters associated with public products, including category ancestors', async () => {
    const filters = await service.filters();
    expect(filters.categories.map((c) => c.id)).toEqual(
      expect.arrayContaining([parent, child]),
    );
    expect(filters.categories.map((c) => c.id)).not.toContain(hiddenCategory);
    expect(filters.values.map((v) => v.id)).toContain(pearl);
    expect(filters.values.map((v) => v.id)).not.toContain(secretValue);
    expect(filters.tags).toContain(marker);
    expect(filters.tags).not.toContain(`${marker}-secret`);
  });
  it('bounds pagination, rejects internal filters, and returns empty valid unknown filters', async () => {
    for (const query of [
      'status=DRAFT',
      'warehouseId=anything',
      'minPrice=10&maxPrice=2',
      'minPrice=invalid&maxPrice=10',
      'pageSize=100',
      'valueIds=invalid',
    ])
      expect((await fetch(`${base}?${query}`)).status).toBe(400);
    expect(
      (await service.list({ q: marker, pageSize: 1, page: 2 })).items,
    ).toEqual([]);
    expect(
      (await service.list({ q: marker, valueIds: randomUUID() })).total,
    ).toBe(0);
    expect(
      (await service.list({ q: marker, categoryId: randomUUID() })).total,
    ).toBe(0);
  });
});
