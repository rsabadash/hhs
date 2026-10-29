import { acquireWriteLock } from './write-lock.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { Database } from './db.js';
import { AdminGuard } from './auth.js';
import { parse, uuid } from './validation.js';
import { imageEdit, imageInput } from './catalog-validation.js';
export function imageBytes(data: string) {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) throw new BadRequestException('Оберіть JPEG, PNG або WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (
    !bytes.length ||
    bytes.length > 3 * 1024 * 1024 ||
    bytes.toString('base64') !== match[2]
  )
    throw new BadRequestException('Зображення має бути до 3 МБ.');
  const valid =
    match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : match[1] === 'jpeg'
        ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
        : bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid)
    throw new BadRequestException(
      'Вміст файлу не відповідає формату зображення.',
    );
  return bytes;
}
@Injectable()
export class ImageStore {
  configured() {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
    );
  }
  private options() {
    if (!this.configured())
      throw new ServiceUnavailableException(
        'Завантаження зображень ще не налаштоване.',
      );
    return {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      timeout: 40000,
    };
  }
  async upload(publicId: string, bytes: Buffer) {
    const options = this.options();
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              ...options,
              public_id: publicId,
              overwrite: false,
              resource_type: 'image',
              allowed_formats: ['jpg', 'png', 'webp'],
              transformation: [{ width: 2000, height: 2000, crop: 'limit' }],
            },
            (error, result) =>
              error || !result ? reject(error) : resolve(result),
          )
          .end(bytes);
      });
      if (
        result.public_id !== publicId ||
        !result.secure_url.startsWith('https://res.cloudinary.com/')
      )
        throw Error('Invalid provider response');
      return result.secure_url;
    } catch {
      throw new ServiceUnavailableException(
        'Не вдалося завантажити зображення. Спробуйте ще раз.',
      );
    }
  }
  async destroy(publicId: string) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        ...this.options(),
        resource_type: 'image',
        invalidate: true,
      });
      if (!['ok', 'not found'].includes(result.result))
        throw Error('Delete failed');
    } catch {
      throw new ServiceUnavailableException(
        'Видалення файлу буде повторено під час очищення.',
      );
    }
  }
}
@Injectable()
export class ImageService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(ImageStore) private readonly store: ImageStore,
  ) {}
  async upload(productId: string, input: unknown) {
    const data = parse(imageInput, input);
    const bytes = imageBytes(data.data);
    if (!this.store.configured())
      throw new ServiceUnavailableException(
        'Завантаження зображень ще не налаштоване.',
      );
    const product = await this.db.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.archivedAt)
      throw new BadRequestException('Оберіть активний товар.');
    if (
      data.variantId &&
      !(await this.db.variant.findFirst({
        where: { id: data.variantId, productId, archivedAt: null },
      }))
    )
      throw new BadRequestException('Варіант не належить цьому товару.');
    const publicId = `hhs/products/${productId}/${randomUUID()}`;
    // Durable reservation before network IO: even timed-out uploads can be cleaned later.
    await this.db.imageCleanup.create({ data: { publicId } });
    const url = await this.store.upload(publicId, bytes);
    return this.db.$transaction(
      async (tx) => {
        await acquireWriteLock(tx);
        if (
          !(await tx.product.findFirst({
            where: { id: productId, archivedAt: null },
          }))
        )
          throw new BadRequestException('Товар уже архівовано.');
        if (
          data.variantId &&
          !(await tx.variant.findFirst({
            where: { id: data.variantId, productId, archivedAt: null },
          }))
        )
          throw new BadRequestException('Варіант уже архівовано.');
        if ((await tx.image.count({ where: { productId } })) >= 20)
          throw new BadRequestException('До 20 зображень на товар.');
        const last = await tx.image.aggregate({
          where: { productId },
          _max: { position: true },
        });
        const image = await tx.image.create({
          data: {
            publicId,
            url,
            productId,
            variantId: data.variantId,
            alt: data.alt,
            position: Math.min((last._max.position ?? -1) + 1, 999),
          },
        });
        await tx.imageCleanup.delete({ where: { publicId } });
        return image;
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }
  async edit(productId: string, id: string, input: unknown) {
    const data = parse(imageEdit, input);
    return this.db.$transaction(
      async (tx) => {
        await acquireWriteLock(tx);
        if (!(await tx.image.findFirst({ where: { id, productId } })))
          throw new NotFoundException('Зображення не знайдено.');
        if (
          data.variantId &&
          !(await tx.variant.findFirst({
            where: { id: data.variantId, productId },
          }))
        )
          throw new BadRequestException('Варіант не належить цьому товару.');
        return tx.image.update({ where: { id }, data });
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }
  async remove(productId: string, id: string) {
    const removed = await this.db.$transaction(
      async (tx) => {
        await acquireWriteLock(tx);
        const image = await tx.image.findFirst({ where: { id, productId } });
        if (!image) return null;
        await tx.imageCleanup.upsert({
          where: { publicId: image.publicId },
          create: { publicId: image.publicId },
          update: {},
        });
        await tx.image.delete({ where: { id } });
        return image;
      },
      { timeout: 30000, maxWait: 10000 },
    );
    let cleanupPending = false;
    if (removed) {
      try {
        await this.store.destroy(removed.publicId);
        await this.db.imageCleanup.deleteMany({
          where: { publicId: removed.publicId },
        });
      } catch {
        cleanupPending = true;
      }
    }
    return { ok: true, cleanupPending };
  }
  async cleanup() {
    const pending = await this.db.imageCleanup.findMany({
      where: { createdAt: { lt: new Date(Date.now() - 86400000) } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    let removed = 0;
    for (const item of pending) {
      if (
        await this.db.image.findUnique({ where: { publicId: item.publicId } })
      )
        continue;
      await this.store.destroy(item.publicId);
      await this.db.imageCleanup.deleteMany({
        where: { publicId: item.publicId },
      });
      removed++;
    }
    return { removed };
  }
}
@Controller('admin/products')
@UseGuards(AdminGuard)
export class ImageController {
  constructor(
    @Inject(ImageService) private readonly images: ImageService,
    @Inject(ImageStore) private readonly store: ImageStore,
  ) {}
  @Get('image-settings') settings() {
    return { configured: this.store.configured(), maxBytes: 3 * 1024 * 1024 };
  }
  @Post(':productId/images') upload(
    @Param('productId') p: string,
    @Body() b: unknown,
  ) {
    return this.images.upload(parse(uuid, p), b);
  }
  @Put(':productId/images/:id') edit(
    @Param('productId') p: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.images.edit(parse(uuid, p), parse(uuid, id), b);
  }
  @Delete(':productId/images/:id') remove(
    @Param('productId') p: string,
    @Param('id') id: string,
  ) {
    return this.images.remove(parse(uuid, p), parse(uuid, id));
  }
}
