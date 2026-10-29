import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { CatalogProduct } from '../../apps/web/src/lib/catalog';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQ8bX9DwAC9QGuYeB4NwAAAABJRU5ErkJggg==';
let server: Server;
let product: CatalogProduct | undefined;
let creates = 0;
let updates = 0;
let failUpload = false;
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
    if (url.pathname.endsWith('/images') && product) {
      if (failUpload) {
        failUpload = false;
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
  failUpload = false;
  configured = true;
  await context.addCookies([
    { name: 'hhs_session', value: 'ui-only', url: 'http://127.0.0.1:3100' },
  ]);
});

for (const variantImage of [false, true]) {
  test(`save with ${variantImage ? 'variant image and upload retry' : 'shared image'}`, async ({
    page,
  }, testInfo) => {
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
      await page.getByRole('button', { name: 'Штука', exact: true }).click();
    }
    const fileInput = page.getByLabel('Фото до збереження');
    // Invalid files must not create a product.
    await fileInput.setInputFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('bad'),
    });
    await page
      .getByRole('button', { name: 'Зберегти товар', exact: true })
      .click();
    await expect(
      page.locator('.catalog-save').getByRole('alert'),
    ).toContainText('Оберіть JPEG');
    expect(creates).toBe(0);
    await fileInput.setInputFiles({
      name: 'pearl.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    if (variantImage) {
      await page.getByLabel('Зображення для').selectOption('1');
      failUpload = true;
    }
    await fileInput.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('image-save.png') });
    await page
      .getByRole('button', { name: 'Зберегти товар', exact: true })
      .click();
    if (variantImage) {
      await expect(
        page.locator('.catalog-save').getByRole('alert'),
      ).toContainText('Товар збережено, але зображення не завантажено');
      expect(creates).toBe(1);
      await page
        .getByRole('button', { name: 'Зберегти товар', exact: true })
        .click();
    }
    await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]{36}$/);
    expect(creates).toBe(1);
    expect(updates).toBe(variantImage ? 1 : 0);
    expect(product!.images).toHaveLength(1);
    expect(product!.images[0].variantId).toBe(
      variantImage
        ? product!.variants.find((v) => v.sku === 'PEARL-1')!.id
        : null,
    );
    await expect(page.locator('.image-card img')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test('unconfigured uploads leave product saving available', async ({
  page,
}) => {
  configured = false;
  await page.goto('/admin/products/new');
  await expect(page.getByLabel('Фото до збереження')).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'Cloudinary ще не налаштовано',
  );
  await expect(
    page.getByRole('button', { name: 'Зберегти товар', exact: true }),
  ).toBeEnabled();
});
