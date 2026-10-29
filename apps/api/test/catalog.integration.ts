import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { Database } from '../src/db.js';
import { CatalogService } from '../src/catalog.js';
import { ImageService, ImageStore } from '../src/images.js';
import { hashPassword } from '../src/password.js';
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw Error('Isolated DATABASE_URL=TEST_DATABASE_URL required.');
const db = new Database();
const service = new CatalogService(db);
const marker = `m3-${randomUUID()}`;
const ids: string[] = [];
let category: string,
  child: string,
  unit: string,
  otherUnit: string,
  attribute: string,
  small: string,
  large: string,
  warehouse: string;
let api: ChildProcess;
let cookie = '';
let adminId: string;
const path = 'http://127.0.0.1:4102/admin/products';
const input = (suffix = '') => ({
  name: `${marker} Перлини ${suffix}`,
  description: 'Натуральні перлини',
  categoryId: child,
  archived: false,
  tags: [` ${marker} Тег `],
  attributes: [],
  variants: [
    {
      name: 'Малі',
      sku: `${marker}-${suffix}S`,
      unitId: unit,
      status: 'DRAFT',
      sellPrice: '10.50',
      archived: false,
      attributes: [{ attributeId: attribute, valueId: small }],
    },
    {
      name: 'Великі',
      sku: `${marker}-${suffix}L`,
      unitId: unit,
      status: 'PUBLISHED',
      sellPrice: '100.00',
      archived: false,
      attributes: [{ attributeId: attribute, valueId: large }],
    },
  ],
});
async function create(suffix: string) {
  const p = await service.save(undefined, input(suffix));
  ids.push(p.id);
  return p;
}
async function editable(id: string) {
  const p = await service.get(id);
  return {
    ...input(''),
    name: p.name,
    categoryId: p.categoryId,
    updatedAt: p.updatedAt.toISOString(),
    tags: p.tags.map((t) => t.tag.name),
    attributes: p.attributes.map((a) => ({
      attributeId: a.attributeId,
      valueId: a.valueId,
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      unitId: v.unitId,
      status: v.status,
      sellPrice: v.sellPrice?.toString() ?? null,
      archived: Boolean(v.archivedAt),
      attributes: v.attributes.map((a) => ({
        attributeId: a.attributeId,
        valueId: a.valueId,
      })),
    })),
  };
}
beforeAll(async () => {
  category = (await db.category.create({ data: { name: marker } })).id;
  child = (
    await db.category.create({
      data: { name: `${marker}-child`, parentId: category },
    })
  ).id;
  unit = (await db.unit.create({ data: { name: marker, symbol: marker } })).id;
  otherUnit = (
    await db.unit.create({ data: { name: marker, symbol: `${marker}-pair` } })
  ).id;
  attribute = (
    await db.attribute.create({
      data: { name: marker, kind: 'NUMBER', measurementSymbol: 'мм' },
    })
  ).id;
  small = (
    await db.attributeValue.create({
      data: { attributeId: attribute, label: '4', numericValue: '4' },
    })
  ).id;
  large = (
    await db.attributeValue.create({
      data: { attributeId: attribute, label: '8', numericValue: '8' },
    })
  ).id;
  warehouse = (await db.warehouse.create({ data: { name: marker } })).id;
  adminId = (
    await db.admin.create({
      data: {
        email: `${marker}@example.test`,
        passwordHash: await hashPassword(marker),
      },
    })
  ).id;
  const token = randomUUID().replaceAll('-', '').repeat(2);
  await db.session.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      adminId,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  cookie = `hhs_session=${token}`;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      PORT: '4102',
      NODE_ENV: 'test',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    },
    stdio: 'ignore',
  });
  for (let n = 0; n < 60; n++) {
    if (
      await fetch('http://127.0.0.1:4102/health/ready')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
}, 30000);
afterAll(async () => {
  api?.kill();
  await db.stockBalance.deleteMany({ where: { warehouseId: warehouse } });
  await db.image.deleteMany({ where: { productId: { in: ids } } });
  await db.variant.deleteMany({ where: { productId: { in: ids } } });
  await db.product.deleteMany({ where: { id: { in: ids } } });
  await db.tag.deleteMany({ where: { name: { startsWith: marker } } });
  await db.imageCleanup.deleteMany({
    where: { publicId: { contains: ids[0] || marker } },
  });
  await db.attributeValue.deleteMany({ where: { attributeId: attribute } });
  await db.attribute.delete({ where: { id: attribute } });
  await db.unit.deleteMany({ where: { id: { in: [unit, otherUnit] } } });
  await db.category.delete({ where: { id: child } });
  await db.category.delete({ where: { id: category } });
  await db.warehouse.delete({ where: { id: warehouse } });
  await db.admin.delete({ where: { id: adminId } });
  await db.$disconnect();
});
describe('catalog persisted rules', () => {
  it('protects routes, validates writes, and exposes image configuration without secrets', async () => {
    expect((await fetch(path)).status).toBe(401);
    expect(
      (
        await fetch(path, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(`${path}/image-settings`, { headers: { cookie } })).status,
    ).toBe(200);
    const r = await fetch(path, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'x-hhs-csrf': '1',
      },
      body: '{}',
    });
    expect(r.status).toBe(400);
  });
  it('creates two SKUs, searches Ukrainian names and descendant categories, filters a single variant', async () => {
    const p = await create('first');
    expect(p.variants).toHaveLength(2);
    const query = { q: `${marker} перлини`, categoryId: category };
    expect((await service.list(query)).total).toBe(1);
    expect(
      (await service.list({ ...query, valueIds: small, minPrice: '50' })).total,
    ).toBe(0);
    expect(
      (
        await service.list({
          ...query,
          valueIds: large,
          minPrice: '50',
          status: 'PUBLISHED',
        })
      ).total,
    ).toBe(1);
    expect((await service.list({ q: `${marker}-firstS` })).total).toBe(1);
    await db.stockBalance.create({
      data: {
        variantId: p.variants[0].id,
        warehouseId: warehouse,
        quantity: 2,
      },
    });
    expect(
      (
        await service.list({
          ...query,
          inStock: 'true',
          warehouseId: warehouse,
          valueIds: large,
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await service.list({
          ...query,
          inStock: 'true',
          warehouseId: warehouse,
          valueIds: small,
        })
      ).total,
    ).toBe(1);
  });
  it('rejects duplicate SKU atomically and rejects foreign variant IDs', async () => {
    const b = input('duplicate');
    b.variants[0].sku = `${marker}-firstS`;
    await expect(service.save(undefined, b)).rejects.toThrow('SKU');
    expect(await db.product.count({ where: { name: b.name } })).toBe(0);
    const p = await create('second');
    const edit = await editable(p.id);
    edit.variants[0].id = (await service.get(ids[0])).variants[0].id;
    await expect(service.save(p.id, edit)).rejects.toThrow('іншому');
  });
  it('serializes edits, protects units with stock history and preserves archived SKUs', async () => {
    const p = ids[0];
    const edit = await editable(p);
    edit.variants[0].unitId = otherUnit;
    await expect(service.save(p, edit)).rejects.toThrow('Одиницю');
    const valid = await editable(p);
    const results = await Promise.allSettled([
      service.save(p, { ...valid, description: 'A' }),
      service.save(p, { ...valid, description: 'B' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const missing = await editable(p);
    missing.variants.pop();
    await expect(service.save(p, missing)).rejects.toThrow('не можна видаляти');
    await service.save(p, { ...(await editable(p)), archived: true });
    expect(
      (await service.get(p)).variants.every((v) => v.status === 'DRAFT'),
    ).toBe(true);
    expect((await service.list({ q: marker, archived: 'true' })).total).toBe(1);
  });
  it('keeps a shared tag until its final product detaches it, including concurrent edits', async () => {
    const a = await editable(ids[0]),
      b = await editable(ids[1]);
    await service.save(ids[0], { ...a, tags: [] });
    expect(await db.tag.count({ where: { name: `${marker} тег` } })).toBe(1);
    await service.save(ids[1], { ...b, tags: [] });
    expect(await db.tag.count({ where: { name: `${marker} тег` } })).toBe(0);
    await Promise.all(
      ids.slice(0, 2).map(async (id) =>
        service.save(id, {
          ...(await editable(id)),
          tags: [`${marker} Спільний`],
        }),
      ),
    );
    expect(await db.tag.count({ where: { name: `${marker} спільний` } })).toBe(
      1,
    );
    expect(
      await db.productTag.count({
        where: { tag: { name: `${marker} спільний` } },
      }),
    ).toBe(2);
  });
  it('supports connector and pair-based earring-back products with shared attributes', async () => {
    const connector = input('connector');
    connector.name = `${marker} Кільце-конектор`;
    const saved = await service.save(undefined, connector);
    ids.push(saved.id);
    const backs = input('backs');
    backs.name = `${marker} Заглушки для сережок`;
    backs.variants = [backs.variants[0]];
    backs.variants[0].unitId = otherUnit;
    const pair = await service.save(undefined, backs);
    ids.push(pair.id);
    expect(pair.variants[0].unitId).toBe(otherUnit);
    const edit = await editable(pair.id);
    edit.attributes = edit.variants[0].attributes;
    edit.variants[0].attributes = [];
    await service.save(pair.id, edit);
    expect(
      (await service.list({ q: backs.name, valueIds: small, minPrice: '10' }))
        .total,
    ).toBe(1);
    // Keep this pair of fixtures independent from the tag lifecycle scenario.
    for (const id of [saved.id, pair.id])
      await service.save(id, { ...(await editable(id)), tags: [] });
  }, 30000);
  it('binds uploaded files to owned variants, orders images, and retries provider deletion failures', async () => {
    const product = ids[1];
    const p = await service.get(product);
    const bytes =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQ8bX9DwAC9QGuYeB4NwAAAABJRU5ErkJggg==';
    let failDelete = true;
    const store = {
      configured: () => true,
      upload: async (id: string) =>
        `https://res.cloudinary.com/test/image/upload/${id}.png`,
      destroy: async () => {
        if (failDelete) throw Error('provider down');
      },
    } as unknown as ImageStore;
    const images = new ImageService(db, store);
    await expect(
      images.upload(product, {
        variantId: (await service.get(ids[0])).variants[0].id,
        alt: '',
        data: bytes,
      }),
    ).rejects.toThrow('не належить');
    const shared = await images.upload(product, {
      variantId: null,
      alt: 'Перлини',
      data: bytes,
    });
    const specific = await images.upload(product, {
      variantId: p.variants[0].id,
      alt: 'Малі перлини',
      data: bytes,
    });
    await expect(
      images.edit(product, shared.id, {
        variantId: randomUUID(),
        alt: '',
        position: 0,
      }),
    ).rejects.toThrow('не належить');
    await images.edit(product, specific.id, {
      variantId: p.variants[0].id,
      alt: 'Нове фото',
      position: 0,
    });
    expect((await service.get(product)).images).toHaveLength(2);
    expect(await images.remove(product, shared.id)).toEqual({
      ok: true,
      cleanupPending: true,
    });
    expect(await db.image.findUnique({ where: { id: shared.id } })).toBeNull();
    await db.imageCleanup.update({
      where: { publicId: shared.publicId },
      data: { createdAt: new Date(Date.now() - 2 * 86400000) },
    });
    failDelete = false;
    expect(await images.cleanup()).toEqual({ removed: 1 });
    expect(
      await db.imageCleanup.findUnique({
        where: { publicId: shared.publicId },
      }),
    ).toBeNull();
    await images.remove(product, specific.id);
  });
});
