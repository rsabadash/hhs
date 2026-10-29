import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from './generated/prisma/client.js';
import { attributeEditorInput, parse } from './validation.js';

// Called inside the reference write transaction and its global write lock.
export async function saveAttribute(
  tx: Prisma.TransactionClient,
  id: string | undefined,
  input: unknown,
) {
  const data = parse(attributeEditorInput, input);
  const old = id
    ? await tx.attribute.findUnique({
        where: { id },
        include: {
          values: {
            include: { _count: { select: { products: true, variants: true } } },
          },
        },
      })
    : null;
  if (id && !old) throw new NotFoundException('Атрибут не знайдено.');
  const existing = new Map(old?.values.map((value) => [value.id, value]) || []);
  const removed = new Set(data.removedValueIds);
  for (const valueId of [
    ...removed,
    ...data.values.flatMap((value) => (value.id ? [value.id] : [])),
  ]) {
    if (!existing.has(valueId))
      throw new BadRequestException('Значення не належить цьому атрибуту.');
  }
  const submitted = new Map(
    data.values
      .filter((value) => value.id)
      .map((value) => [value.id!, value.label]),
  );
  const kept = [...existing.values()].filter((value) => !removed.has(value.id));
  const displayLabel = (label: string) =>
    old?.measurementSymbol ? `${label} ${old.measurementSymbol}` : label;
  for (const value of existing.values()) {
    if (
      value._count.products + value._count.variants > 0 &&
      (removed.has(value.id) ||
        (submitted.has(value.id) &&
          submitted.get(value.id) !== displayLabel(value.label)))
    ) {
      throw new ConflictException(
        'Значення вже використовується в товарі або варіанті. Залиште його та додайте нове.',
      );
    }
  }
  // Unsubmitted values are preserved, including values added by another admin
  // after the editor was opened. Removal always requires an explicit ID.
  const values = [
    ...kept.map((value) => ({
      id: value.id,
      label: submitted.get(value.id) ?? displayLabel(value.label),
    })),
    ...data.values.filter((value) => !value.id),
  ];
  const labels = values.map((value) => value.label.toLocaleLowerCase('uk'));
  if (new Set(labels).size !== labels.length)
    throw new ConflictException('Значення не повинні повторюватися.');
  if (values.some((value) => value.label.length > 160))
    throw new BadRequestException('Значення надто довге (до 160 символів).');
  const attribute = id
    ? await tx.attribute.update({
        where: { id },
        data: { name: data.name, kind: 'CHOICE', measurementSymbol: null },
      })
    : await tx.attribute.create({ data: { name: data.name, kind: 'CHOICE' } });
  if (removed.size)
    await tx.attributeValue.deleteMany({
      where: { attributeId: attribute.id, id: { in: [...removed] } },
    });
  // Temporary labels allow two unused values to exchange labels safely while
  // keeping their IDs. They never escape this atomic transaction.
  for (const value of kept) {
    if (values.find((item) => item.id === value.id)?.label === value.label)
      continue;
    await tx.attributeValue.update({
      where: { id: value.id },
      data: { label: `__edit_${randomUUID()}` },
    });
  }
  for (const value of values) {
    if (
      value.id &&
      (existing.get(value.id)?.label !== value.label ||
        existing.get(value.id)?.numericValue !== null)
    )
      await tx.attributeValue.update({
        where: { id: value.id },
        data: { label: value.label, numericValue: null },
      });
  }
  const added = values.filter((value) => !value.id);
  if (added.length)
    await tx.attributeValue.createMany({
      data: added.map((value) => ({
        attributeId: attribute.id,
        label: value.label,
      })),
    });
  return tx.attribute.findUniqueOrThrow({
    where: { id: attribute.id },
    include: { values: { orderBy: [{ label: 'asc' }, { id: 'asc' }] } },
  });
}
