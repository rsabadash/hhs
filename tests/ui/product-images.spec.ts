import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { checkAccessibility } from '../e2e/accessibility';
import type { CatalogProduct } from '../../apps/web/src/lib/catalog';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQ8bX9DwAC9QGuYeB4NwAAAABJRU5ErkJggg==';
let server: Server;
let product: CatalogProduct | undefined;
let creates = 0;
let updates = 0;
let failAt = 0;
let failMetadata = false;
let uploadCalls = 0;
let imageOperations: string[] = [];
let configured = true;
const category = { id: randomUUID(), name: 'Перлини' };
const unit = { id: randomUUID(), name: 'Штука' };

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const reply = (data: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET') {
      if (url.pathname === '/admin/auth/me')
        return reply({ email: 'ui@example.test' });
      if (url.pathname === '/admin/products/image-settings')
        return reply({ configured });
      if (url.pathname.startsWith('/admin/references/'))
        return reply({
          items: [url.pathname.endsWith('categories') ? category : unit],
          total: 1,
        });
      if (product && url.pathname === `/admin/products/${product.id}`)
        return reply(product);
      return reply({}, 404);
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (
      product &&
      url.pathname.startsWith(`/admin/products/${product.id}/images/`)
    ) {
      const id = url.pathname.split('/').pop();
      if (req.method === 'DELETE') {
        imageOperations.push('delete');
        product.images = product.images.filter((image) => image.id !== id);
        return reply({ ok: true });
      }
      if (failMetadata) {
        failMetadata = false;
        return reply({ message: 'Metadata unavailable' }, 503);
      }
      const image = product.images.find((image) => image.id === id)!;
      Object.assign(image, body);
      imageOperations.push('edit');
      return reply(image);
    }
    if (url.pathname.endsWith('/images') && product) {
      uploadCalls++;
      imageOperations.push('upload');
      if (uploadCalls === failAt) {
        return reply({ message: 'Upload unavailable' }, 503);
      }
      const image = {
        id: randomUUID(),
        url: body.data,
        alt: body.alt,
        variantId: body.variantId,
        position: product.images.length,
      };
      product.images.push(image);
      return reply(image);
    }
    if (
      url.pathname === '/admin/products' ||
      (product && url.pathname === `/admin/products/${product.id}`)
    ) {
      if (req.method === 'POST') creates++;
      else updates++;
      product = {
        ...body,
        id: product?.id || randomUUID(),
        updatedAt: new Date().toISOString(),
        category,
        tags: [],
        images: product?.images || [],
        archivedAt: null,
        // Return another order to catch accidental attachment by array index.
        variants: body.variants
          .map((v: CatalogProduct['variants'][number]) => ({
            ...v,
            sku: v.sku.trim().toUpperCase(),
            id: v.id || randomUUID(),
            unit,
          }))
          .reverse(),
      };
      return reply(product);
    }
    reply({}, 404);
  });
  await new Promise<void>((resolve) =>
    server.listen(4101, '127.0.0.1', resolve),
  );
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
test.beforeEach(async ({ context }) => {
  product = undefined;
  creates = 0;
  updates = 0;
  failAt = 0;
  failMetadata = false;
  uploadCalls = 0;
  imageOperations = [];
  configured = true;
  await context.addCookies([
    { name: 'hhs_session', value: 'ui-only', url: 'http://127.0.0.1:3100' },
  ]);
});

const photo = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(png, 'base64'),
});
async function fillProduct(page: import('@playwright/test').Page) {
  await page.goto('/admin/products/new');
  await page.getByLabel('Назва товару', { exact: true }).fill('Перлини');
  await page
    .getByRole('group', { name: 'Категорія', exact: true })
    .getByRole('button')
    .click();
  await page.getByRole('button', { name: 'Перлини', exact: true }).click();
  await page
    .getByRole('button', { name: 'Додати варіант', exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    const card = page.locator('.variant-card').nth(i);
    await card
      .getByLabel('Назва варіанта', { exact: true })
      .fill(`${i + 1} мм`);
    await card.getByLabel('SKU', { exact: true }).fill(`pearl-${i}`);
    await card
      .getByRole('group', { name: 'Одиниця продажу', exact: true })
      .getByRole('button')
      .click();
    await card
      .locator('.picker-options')
      .getByRole('button', { name: 'Штука', exact: true })
      .click();
  }
}
const save = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Зберегти товар', exact: true });

for (const retry of [false, true]) {
  test(`save multiple shared and variant photos${retry ? ' with partial upload retry' : ''}`, async ({
    page,
  }, testInfo) => {
    await fillProduct(page);
    await expect(page.getByLabel('Фото товару', { exact: true })).toBeHidden();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page
        .locator('.product-details')
        .getByRole('button', { name: 'Додати фото', exact: true })
        .click(),
    ]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([photo('shared-1.png'), photo('shared-2.png')]);
    await page
      .getByLabel('Фото варіанта 1', { exact: true })
      .setInputFiles([photo('first-1.png'), photo('first-2.png')]);
    await page
      .getByLabel('Фото варіанта 2', { exact: true })
      .setInputFiles(photo('second.png'));
    await expect(page.locator('.product-details .photo-item')).toHaveCount(2);
    await expect(
      page.locator('.variant-card').nth(0).locator('.photo-item'),
    ).toHaveCount(2);
    await expect(
      page.locator('.variant-card').nth(1).locator('.photo-item'),
    ).toHaveCount(1);
    await checkAccessibility(page);
    await page.screenshot({
      path: testInfo.outputPath('inline-photos.png'),
      fullPage: true,
    });
    await page
      .locator('.variant-card')
      .first()
      .screenshot({ path: testInfo.outputPath('variant-photos.png') });
    if (retry) failAt = 3;
    await save(page).click();
    if (retry) {
      await expect(
        page.locator('.catalog-save').getByRole('alert'),
      ).toContainText('Товар збережено, але не всі фото збережено');
      expect(product!.images).toHaveLength(2);
      expect(creates).toBe(1);
      await expect(
        page.getByText('До збереження', { exact: true }),
      ).toHaveCount(3);
      await save(page).click();
    }
    await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]{36}$/);
    expect(creates).toBe(1);
    expect(updates).toBe(retry ? 1 : 0);
    expect(uploadCalls).toBe(retry ? 6 : 5);
    expect(product!.images).toHaveLength(5);
    expect(
      product!.images.filter((image) => image.variantId === null),
    ).toHaveLength(2);
    for (const [sku, count] of [
      ['PEARL-0', 2],
      ['PEARL-1', 1],
    ] as const) {
      const id = product!.variants.find((v) => v.sku === sku)!.id;
      expect(
        product!.images.filter((image) => image.variantId === id),
      ).toHaveLength(count);
    }
    await expect(page.locator('.photo-item img')).toHaveCount(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('removing a new variant keeps remaining photos attached to the correct SKU', async ({
  page,
}) => {
  await fillProduct(page);
  await page
    .getByLabel('Фото варіанта 1', { exact: true })
    .setInputFiles(photo('remove.png'));
  await page
    .getByLabel('Фото варіанта 2', { exact: true })
    .setInputFiles([photo('keep.png'), photo('discard.png')]);
  await page
    .locator('.variant-card')
    .nth(1)
    .getByRole('button', { name: 'Прибрати фото', exact: true })
    .last()
    .click();
  await page
    .locator('.variant-card')
    .first()
    .getByRole('button', { name: 'Прибрати варіант', exact: true })
    .click();
  await expect(page.locator('.variant-card')).toHaveCount(1);
  await expect(page.locator('.photo-item img')).toHaveCount(1);
  await expect(page.getByLabel('SKU', { exact: true })).toHaveValue('pearl-1');
  await save(page).click();
  await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]{36}$/);
  expect(product!.images).toHaveLength(1);
  expect(product!.images[0].variantId).toBe(product!.variants[0].id);
});

test('invalid files and the combined photo limit are checked before saving', async ({
  page,
}) => {
  await fillProduct(page);
  const input = page.getByLabel('Фото товару', { exact: true });
  await input.setInputFiles([
    photo('good.png'),
    { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') },
  ]);
  await expect(
    page.locator('.product-photos').getByRole('alert'),
  ).toContainText('Оберіть JPEG');
  await expect(page.locator('.photo-item')).toHaveCount(0);
  expect(creates).toBe(0);
  await input.setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(3 * 1024 * 1024 + 1),
  });
  await expect(
    page.locator('.product-photos').getByRole('alert'),
  ).toContainText('до 3 МБ');
  await input.setInputFiles(
    Array.from({ length: 19 }, (_, i) => photo(`${i}.png`)),
  );
  await page
    .getByLabel('Фото варіанта 1', { exact: true })
    .setInputFiles([photo('one.png'), photo('two.png')]);
  await expect(
    page.locator('.product-photos').getByRole('alert'),
  ).toContainText('Можна додати ще 1');
  await expect(page.locator('.photo-item')).toHaveCount(19);
  await page
    .getByLabel('Фото варіанта 1', { exact: true })
    .setInputFiles(photo('last.png'));
  for (const button of await page
    .getByRole('button', { name: 'Додати фото', exact: true })
    .all())
    await expect(button).toBeDisabled();
  await page
    .locator('.product-details')
    .getByRole('button', { name: 'Прибрати фото', exact: true })
    .first()
    .click();
  await expect(
    page
      .locator('.product-details')
      .getByRole('button', { name: 'Додати фото', exact: true }),
  ).toBeEnabled();
  expect(creates).toBe(0);
});

test('existing photos can be edited, removed and replaced with the product save', async ({
  page,
}) => {
  await fillProduct(page);
  await page
    .getByLabel('Фото товару', { exact: true })
    .setInputFiles([photo('original.png'), photo('keep.png')]);
  await save(page).click();
  await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]{36}$/);
  await expect(page.locator('.photo-item')).toHaveCount(2);
  const deletedId = product!.images[0].id;
  await page
    .locator('.photo-item')
    .first()
    .getByRole('button', { name: 'Прибрати фото', exact: true })
    .click();
  expect(product!.images).toHaveLength(2);
  await page
    .locator('.photo-item')
    .first()
    .getByText('Налаштування фото', { exact: true })
    .click();
  await page.getByLabel('Опис фото', { exact: true }).fill('Оновлене фото');
  await page.getByLabel('Порядок', { exact: true }).fill('8');
  await page
    .getByLabel('Фото товару', { exact: true })
    .setInputFiles(photo('replacement.png'));
  imageOperations = [];
  await save(page).click();
  await expect
    .poll(() =>
      product!.images.some(
        (image) => image.alt === 'Оновлене фото' && image.position === 8,
      ),
    )
    .toBe(true);
  await expect.poll(() => product!.images.length).toBe(2);
  expect(product!.images.some((image) => image.id === deletedId)).toBe(false);
  expect(imageOperations[0]).toBe('delete');
  await expect(save(page)).toBeEnabled();
  await page.reload();
  await expect(
    page.getByAltText('Оновлене фото', { exact: true }),
  ).toBeVisible();
});

test('unconfigured uploads leave product saving available', async ({
  page,
}) => {
  configured = false;
  await page.goto('/admin/products/new');
  await expect(page.getByLabel('Фото товару', { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel('Фото варіанта 1', { exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'Cloudinary ще не налаштовано',
  );
  await expect(save(page)).toBeEnabled();
});

test('retry after photo metadata failure does not upload the saved photo again', async ({
  page,
}) => {
  await fillProduct(page);
  await page
    .getByLabel('Фото товару', { exact: true })
    .setInputFiles(photo('ordered.png'));
  await page.getByText('Налаштування фото', { exact: true }).click();
  await page.getByLabel('Порядок', { exact: true }).fill('9');
  failMetadata = true;
  await save(page).click();
  await expect(page.locator('.catalog-save').getByRole('alert')).toContainText(
    'не всі фото збережено',
  );
  expect(uploadCalls).toBe(1);
  expect(product!.images).toHaveLength(1);
  await save(page).click();
  await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]{36}$/);
  expect(uploadCalls).toBe(1);
  expect(product!.images[0].position).toBe(9);
});
