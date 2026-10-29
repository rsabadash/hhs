import { acquireWriteLock } from './write-lock.js';
import { saveAttribute } from './attribute-editor.js';
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
  UseGuards,
} from '@nestjs/common';
import { Database } from './db.js';
import { AdminGuard } from './auth.js';
import { Prisma } from './generated/prisma/client.js';
import {
  attributeInput,
  categoryInput,
  listQuery,
  parse,
  referenceKind,
  supplierInput,
  unitInput,
  uuid,
  valueInput,
  warehouseInput,
  type ReferenceKind,
} from './validation.js';

@Injectable()
export class ReferenceService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async list(kind: ReferenceKind, input: unknown) {
    const query = parse(listQuery, input);
    const { q, page, pageSize, sort } = query;
    const contains = { contains: q, mode: 'insensitive' as const };
    const paging = {
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ name: sort }, { id: sort }],
    };
    return this.db.$transaction(
      async (tx) => {
        let items: unknown[];
        let total: number;
        switch (kind) {
          case 'categories': {
            const where = {
              name: contains,
              ...(query.parentId
                ? {
                    parentId: query.parentId === 'root' ? null : query.parentId,
                  }
                : {}),
            };
            [items, total] = await Promise.all([
              tx.category.findMany({
                where,
                ...paging,
                include: {
                  parent: { select: { id: true, name: true } },
                  _count: { select: { children: true } },
                },
              }),
              tx.category.count({ where }),
            ]);
            break;
          }
          case 'attributes': {
            const where = { name: contains, kind: query.kind };
            [items, total] = await Promise.all([
              tx.attribute.findMany({
                where,
                ...paging,
                include: { _count: { select: { values: true } } },
              }),
              tx.attribute.count({ where }),
            ]);
            break;
          }
          case 'attribute-values': {
            if (!query.attributeId)
              throw new BadRequestException('Виберіть атрибут.');
            const where = { attributeId: query.attributeId, label: contains };
            [items, total] = await Promise.all([
              tx.attributeValue.findMany({
                where,
                ...paging,
                orderBy: [{ label: sort }, { id: sort }],
              }),
              tx.attributeValue.count({ where }),
            ]);
            break;
          }
          case 'units': {
            const where = {
              OR: [{ name: contains }, { symbol: contains }],
              ...(query.allowsFraction
                ? { allowsFraction: query.allowsFraction === 'true' }
                : {}),
            };
            [items, total] = await Promise.all([
              tx.unit.findMany({ where, ...paging }),
              tx.unit.count({ where }),
            ]);
            break;
          }
          case 'warehouses': {
            const where = {
              OR: [{ name: contains }, { address: contains }],
              ...(query.hasAddress
                ? { address: query.hasAddress === 'true' ? { not: '' } : '' }
                : {}),
            };
            [items, total] = await Promise.all([
              tx.warehouse.findMany({ where, ...paging }),
              tx.warehouse.count({ where }),
            ]);
            break;
          }
          case 'suppliers': {
            const where = {
              OR: [
                { name: contains },
                { email: contains },
                { phone: contains },
              ],
              ...(query.hasContact
                ? {
                    AND:
                      query.hasContact === 'true'
                        ? [
                            {
                              OR: [
                                { email: { not: '' } },
                                { phone: { not: '' } },
                              ],
                            },
                          ]
                        : [{ email: '', phone: '' }],
                  }
                : {}),
            };
            [items, total] = await Promise.all([
              tx.supplier.findMany({ where, ...paging }),
              tx.supplier.count({ where }),
            ]);
            break;
          }
        }
        return { items, total, page, pageSize };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async get(kind: ReferenceKind, id: string) {
    const where = { id };
    const record = await (kind === 'categories'
      ? this.db.category.findUnique({
          where,
          include: { parent: { select: { id: true, name: true } } },
        })
      : kind === 'attributes'
        ? this.db.attribute.findUnique({
            where,
            include: {
              values: {
                orderBy: [{ label: 'asc' }, { id: 'asc' }],
                include: {
                  _count: { select: { products: true, variants: true } },
                },
              },
            },
          })
        : kind === 'attribute-values'
          ? this.db.attributeValue.findUnique({ where })
          : kind === 'units'
            ? this.db.unit.findUnique({ where })
            : kind === 'warehouses'
              ? this.db.warehouse.findUnique({ where })
              : this.db.supplier.findUnique({ where }));
    if (!record) throw new NotFoundException('Запис не знайдено.');
    return record;
  }
  async save(kind: ReferenceKind, id: string | undefined, input: unknown) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Serialize reference edits across API replicas: two simultaneous category
          // moves must not each validate against an outdated tree.
          await acquireWriteLock(tx);
          switch (kind) {
            case 'categories': {
              const data = parse(categoryInput, input);
              if (data.parentId) {
                const seen = new Set<string>(id ? [id] : []);
                let parentId: string | null = data.parentId;
                while (parentId) {
                  if (seen.has(parentId))
                    throw new ConflictException(
                      'Категорія не може містити себе або свого предка.',
                    );
                  seen.add(parentId);
                  const parent: { parentId: string | null } | null =
                    await tx.category.findUnique({
                      where: { id: parentId },
                      select: { parentId: true },
                    });
                  if (!parent)
                    throw new BadRequestException(
                      'Батьківську категорію не знайдено.',
                    );
                  parentId = parent.parentId;
                }
              }
              return id
                ? tx.category.update({ where: { id }, data })
                : tx.category.create({ data });
            }
            case 'units': {
              const data = parse(unitInput, input);
              if (id) {
                const old = await tx.unit.findUnique({ where: { id } });
                if (!old) throw new NotFoundException('Одиницю не знайдено.');
                if (
                  (old.symbol !== data.symbol ||
                    old.allowsFraction !== data.allowsFraction) &&
                  (await tx.variant.count({ where: { unitId: id } }))
                ) {
                  throw new ConflictException(
                    'Позначення й точність одиниці, яку вже використовують SKU, змінити не можна. Створіть іншу одиницю.',
                  );
                }
              }
              return id
                ? tx.unit.update({ where: { id }, data })
                : tx.unit.create({ data });
            }
            case 'warehouses': {
              const data = parse(warehouseInput, input);
              return id
                ? tx.warehouse.update({ where: { id }, data })
                : tx.warehouse.create({ data });
            }
            case 'suppliers': {
              const data = parse(supplierInput, input);
              return id
                ? tx.supplier.update({ where: { id }, data })
                : tx.supplier.create({ data });
            }
            case 'attributes': {
              if (input && typeof input === 'object' && 'values' in input)
                return saveAttribute(tx, id, input);
              const inputData = parse(attributeInput, input);
              const data = {
                ...inputData,
                measurementSymbol: inputData.measurementSymbol || null,
              };
              if (id) {
                const old = await tx.attribute.findUnique({ where: { id } });
                if (!old) throw new NotFoundException('Атрибут не знайдено.');
                if (
                  (old.kind !== data.kind ||
                    old.measurementSymbol !== data.measurementSymbol) &&
                  (await tx.attributeValue.count({
                    where: { attributeId: id },
                  }))
                ) {
                  throw new ConflictException(
                    'Тип і одиницю атрибута зі значеннями змінити не можна.',
                  );
                }
              }
              return id
                ? tx.attribute.update({ where: { id }, data })
                : tx.attribute.create({ data });
            }
            case 'attribute-values': {
              const inputData = parse(valueInput, input);
              const attribute = await tx.attribute.findUnique({
                where: { id: inputData.attributeId },
              });
              if (!attribute)
                throw new BadRequestException('Атрибут не знайдено.');
              if (
                (attribute.kind === 'NUMBER') !==
                (inputData.numericValue !== null)
              )
                throw new BadRequestException(
                  'Числовий атрибут потребує числа; текстовий — лише назви.',
                );
              const numeric =
                inputData.numericValue === null
                  ? null
                  : new Prisma.Decimal(inputData.numericValue);
              const data = {
                ...inputData,
                numericValue: numeric,
                label: numeric?.toString() ?? inputData.label,
              };
              if (id) {
                const old = await tx.attributeValue.findUnique({
                  where: { id },
                });
                if (!old) throw new NotFoundException('Значення не знайдено.');
                if (old.attributeId !== data.attributeId)
                  throw new ConflictException(
                    'Перенести значення до іншого атрибута не можна.',
                  );
                const used =
                  (await tx.productAttributeValue.count({
                    where: { valueId: id },
                  })) +
                  (await tx.variantAttributeValue.count({
                    where: { valueId: id },
                  }));
                if (
                  used &&
                  (old.label !== data.label ||
                    old.numericValue?.toString() !== numeric?.toString())
                )
                  throw new ConflictException(
                    'Значення вже використовується. Створіть нове значення.',
                  );
              }
              return id
                ? tx.attributeValue.update({ where: { id }, data })
                : tx.attributeValue.create({ data });
            }
          }
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException('Такий запис уже існує.');
        if (error.code === 'P2025')
          throw new NotFoundException('Запис не знайдено.');
        if (error.code === 'P2003')
          throw new ConflictException(
            'Пов’язаний запис не знайдено або він використовується.',
          );
      }
      throw error;
    }
  }
}
@Controller('admin/references')
@UseGuards(AdminGuard)
export class ReferenceController {
  constructor(
    @Inject(ReferenceService) private readonly references: ReferenceService,
  ) {}
  @Get(':kind') list(@Param('kind') kind: string, @Query() query: unknown) {
    return this.references.list(parse(referenceKind, kind), query);
  }
  @Get(':kind/:id') get(@Param('kind') kind: string, @Param('id') id: string) {
    return this.references.get(parse(referenceKind, kind), parse(uuid, id));
  }
  @Post(':kind') create(@Param('kind') kind: string, @Body() input: unknown) {
    return this.references.save(parse(referenceKind, kind), undefined, input);
  }
  @Put(':kind/:id') update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.references.save(
      parse(referenceKind, kind),
      parse(uuid, id),
      input,
    );
  }
}
