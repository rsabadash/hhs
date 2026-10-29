import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../src/db.js';
import { ReferenceService } from '../src/references.js';

if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw Error('Isolated DATABASE_URL=TEST_DATABASE_URL required.');
const db = new Database();
const service = new ReferenceService(db);
const marker = `attributes-${randomUUID()}`;
const read = (id: string) =>
  db.attribute.findUniqueOrThrow({
    where: { id },
    include: { values: { orderBy: { label: 'asc' } } },
  });
async function create(suffix: string, labels: string[]) {
  const result = await service.save('attributes', undefined, {
    name: `${marker}-${suffix}`,
    values: labels.map((label) => ({ label })),
  });
  return read(result!.id);
}
afterAll(async () => {
  await db.variant.deleteMany({ where: { sku: { startsWith: marker } } });
  await db.product.deleteMany({ where: { name: { startsWith: marker } } });
  await db.attributeValue.deleteMany({
    where: { attribute: { name: { startsWith: marker } } },
  });
  await db.attribute.deleteMany({ where: { name: { startsWith: marker } } });
  await db.category.deleteMany({ where: { name: { startsWith: marker } } });
  await db.unit.deleteMany({ where: { name: { startsWith: marker } } });
  await db.$disconnect();
});

describe('inline attribute editor', () => {
  it('saves multiple labels together and edits, swaps and removes unused values', async () => {
    const attribute = await create('bulk', ['4 мм', '6 мм', '8 мм']);
    expect(attribute.values.map((value) => value.label)).toEqual([
      '4 мм',
      '6 мм',
      '8 мм',
    ]);
    const [first, second, removed] = attribute.values;
    await service.save('attributes', attribute.id, {
      name: `${attribute.name}-renamed`,
      values: [
        { id: first.id, label: '6 мм' },
        { id: second.id, label: '4 мм' },
        { label: '10 мм' },
      ],
      removedValueIds: [removed.id],
    });
    const saved = await read(attribute.id);
    expect(saved.values.map((value) => value.label)).toEqual([
      '10 мм',
      '4 мм',
      '6 мм',
    ]);
    expect(saved.values.find((value) => value.id === first.id)?.label).toBe(
      '6 мм',
    );
    // A stale editor must not remove an option added in the meantime.
    await service.save('attributes', attribute.id, {
      name: saved.name,
      values: [{ id: first.id, label: '7 мм' }],
    });
    expect((await read(attribute.id)).values).toHaveLength(3);
  });

  it('rejects duplicates and foreign IDs without partially renaming the attribute', async () => {
    const attribute = await create('validation', ['Золото', 'Срібло']);
    const other = await create('other', ['Білий']);
    for (const change of [
      { values: [{ label: 'золото' }] },
      { values: [{ id: other.values[0].id, label: 'Новий' }] },
      { values: [], removedValueIds: [other.values[0].id] },
    ]) {
      await expect(
        service.save('attributes', attribute.id, {
          name: `${attribute.name}-changed`,
          ...change,
        }),
      ).rejects.toThrow();
      expect((await read(attribute.id)).name).toBe(attribute.name);
      expect((await read(attribute.id)).values).toHaveLength(2);
    }
  });

  it('preserves used numeric value IDs and displayed units, and blocks their removal or relabeling', async () => {
    const old = await db.attribute.create({
      data: {
        name: `${marker}-legacy`,
        kind: 'NUMBER',
        measurementSymbol: 'мм',
        values: {
          create: [
            { label: '4', numericValue: '4' },
            { label: '6', numericValue: '6' },
          ],
        },
      },
      include: { values: { orderBy: { label: 'asc' } } },
    });
    const category = await db.category.create({ data: { name: marker } });
    const unit = await db.unit.create({ data: { name: marker, symbol: 'шт' } });
    const product = await db.product.create({
      data: {
        name: marker,
        categoryId: category.id,
        attributes: {
          create: { attributeId: old.id, valueId: old.values[0].id },
        },
      },
    });
    const variant = await db.variant.create({
      data: {
        name: marker,
        sku: marker,
        productId: product.id,
        unitId: unit.id,
        attributes: {
          create: { attributeId: old.id, valueId: old.values[1].id },
        },
      },
    });
    await service.save('attributes', old.id, {
      name: old.name,
      values: old.values.map((value) => ({
        id: value.id,
        label: `${value.label} мм`,
      })),
    });
    const saved = await read(old.id);
    expect(saved.kind).toBe('CHOICE');
    expect(saved.measurementSymbol).toBeNull();
    expect(saved.values.map((value) => [value.id, value.label])).toEqual(
      old.values.map((value) => [value.id, `${value.label} мм`]),
    );
    expect(
      await db.productAttributeValue.count({
        where: { productId: product.id, valueId: old.values[0].id },
      }),
    ).toBe(1);
    expect(
      await db.variantAttributeValue.count({
        where: { variantId: variant.id, valueId: old.values[1].id },
      }),
    ).toBe(1);
    for (const value of saved.values) {
      await expect(
        service.save('attributes', old.id, {
          name: `${old.name}-changed`,
          values: [{ id: value.id, label: '99 мм' }],
        }),
      ).rejects.toThrow('використовується');
      await expect(
        service.save('attributes', old.id, {
          name: old.name,
          values: [],
          removedValueIds: [value.id],
        }),
      ).rejects.toThrow('використовується');
    }
    expect((await read(old.id)).name).toBe(old.name);
  });
});
