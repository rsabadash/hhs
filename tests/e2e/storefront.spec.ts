import { checkAccessibility } from './accessibility';
import { test, expect } from '@playwright/test';
import { adminFixture } from '../../apps/api/test/e2e-fixture';
import { galleryFixture } from '../../apps/api/test/storefront-images';

test('customer finds a received published SKU, selects variants and prepares an Instagram inquiry', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const fixture = await adminFixture();
  const m = fixture.marker;
  async function post(path: string, data: object) {
    const r = await request.post(`/api/admin/${path}`, {
      headers: { origin: 'http://127.0.0.1:3000', 'x-hhs-csrf': '1' },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  try {
    await post('auth/login', {
      email: fixture.email,
      password: fixture.password,
    });
    const parent = await post('references/categories', {
      name: `Фурнітура ${m}`,
      parentId: null,
    });
    const child = await post('references/categories', {
      name: `Конектори ${m}`,
      parentId: parent.id,
    });
    const unit = await post('references/units', {
      name: `Штука ${m}`,
      symbol: `шт-${m}`,
      allowsFraction: false,
    });
    const warehouse = await post('references/warehouses', {
      name: `Склад ${m}`,
      address: '',
    });
    const supplier = await post('references/suppliers', {
      name: `Постачальник ${m}`,
      email: '',
      phone: '',
    });
    const attribute = await post('references/attributes', {
      name: `Діаметр ${m}`,
      kind: 'NUMBER',
      measurementSymbol: 'мм',
    });
    const small = await post('references/attribute-values', {
      attributeId: attribute.id,
      label: '4',
      numericValue: '4',
    });
    const large = await post('references/attribute-values', {
      attributeId: attribute.id,
      label: '8',
      numericValue: '8',
    });
    const hiddenValue = await post('references/attribute-values', {
      attributeId: attribute.id,
      label: '12',
      numericValue: '12',
    });
    const body = {
      name: `Кільце-конектор ${m}`,
      categoryId: child.id,
      description:
        'Для сережок і підвісок. <script>window.hhsInjected = true</script>',
      tags: [m],
      attributes: [],
      archived: false,
      variants: [
        {
          name: 'Малий',
          sku: `${m}-S`,
          unitId: unit.id,
          status: 'DRAFT',
          sellPrice: '25.50',
          archived: false,
          attributes: [{ attributeId: attribute.id, valueId: small.id }],
        },
        {
          name: 'Великий',
          sku: `${m}-L`,
          unitId: unit.id,
          status: 'DRAFT',
          sellPrice: '40.00',
          archived: false,
          attributes: [{ attributeId: attribute.id, valueId: large.id }],
        },
        {
          name: 'Прихований',
          sku: `${m}-SECRET`,
          unitId: unit.id,
          status: 'DRAFT',
          sellPrice: '1.00',
          archived: false,
          attributes: [{ attributeId: attribute.id, valueId: hiddenValue.id }],
        },
      ],
    };
    const draft = await post('products', body);
    const smallVariant = draft.variants.find((v: { sku: string }) =>
      v.sku.endsWith('-S'),
    );
    const largeVariant = draft.variants.find((v: { sku: string }) =>
      v.sku.endsWith('-L'),
    );
    const supply = await post('inventory/supplies', {
      reference: `SUP-${m}`,
      warehouseId: warehouse.id,
      supplierId: supplier.id,
      notes: '',
      items: [{ variantId: smallVariant.id, quantity: '5', unitCost: '10' }],
    });
    await post(`inventory/supplies/${supply.id}/receive`, {
      revision: supply.revision,
    });
    const published = await request.put(`/api/admin/products/${draft.id}`, {
      headers: { origin: 'http://127.0.0.1:3000', 'x-hhs-csrf': '1' },
      data: {
        ...body,
        updatedAt: draft.updatedAt,
        variants: body.variants.map((v) => ({
          ...v,
          id: draft.variants.find(
            (x: { sku: string }) => x.sku === v.sku.toUpperCase(),
          ).id,
          status: v.sku.endsWith('SECRET') ? 'DRAFT' : 'PUBLISHED',
        })),
      },
    });
    expect(published.ok(), await published.text()).toBeTruthy();
    await galleryFixture(draft.id, largeVariant.id, m);
    await page.route('**/_next/image?**', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=',
          'base64',
        ),
      }),
    );
    // Browser remains anonymous; the separate request context owns admin cookies.
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Пошук', exact: true }).fill(m);
    await page.getByRole('button', { name: /^Фільтри/ }).click();
    await page
      .getByRole('combobox', { name: 'Категорія', exact: true })
      .selectOption(parent.id);
    await page
      .getByRole('combobox', { name: `Діаметр ${m}, мм`, exact: true })
      .selectOption(small.id);
    await page
      .getByRole('combobox', { name: 'Наявність', exact: true })
      .selectOption('true');
    await page.getByRole('button', { name: 'Застосувати' }).click();
    const card = page.locator('.product-card').filter({ hasText: body.name });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText('25,50');
    await checkAccessibility(page);
    await page.screenshot({
      path: testInfo.outputPath('catalog.png'),
      fullPage: true,
    });
    await card.getByRole('link').click();
    await expect(page.locator('.sku')).toContainText(smallVariant.sku);
    await expect(
      page.getByText(body.description, { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => 'hhsInjected' in window)).toBe(false);
    await expect(
      page.getByRole('img', { name: 'Спільне фото', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Є в наявності', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('option', { name: /Прихований/ })).toHaveCount(
      0,
    );
    await page
      .getByRole('combobox', { name: 'Варіант', exact: true })
      .selectOption(largeVariant.id);
    await expect(page.locator('.sku')).toContainText(largeVariant.sku);
    await expect(page.locator('.detail-price')).toContainText('40,00');
    await expect(
      page.getByText('Немає в наявності', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Варіантне фото', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Фото 2', exact: true }).click();
    await expect(
      page.getByRole('img', { name: 'Друге фото', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Скопіювати повідомлення' }).click();
    await expect(page.getByLabel('Текст повідомлення')).toHaveValue(
      new RegExp(largeVariant.sku),
    );
    await expect(page.getByLabel('Текст повідомлення')).toHaveValue(
      /коли очікується надходження/,
    );
    if (process.env.NEXT_PUBLIC_INSTAGRAM_USERNAME)
      await expect(
        page.getByRole('link', { name: 'Відкрити Instagram' }),
      ).toHaveAttribute('href', new RegExp('https://www.instagram.com/'));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await checkAccessibility(page);
    await page.screenshot({
      path: testInfo.outputPath('product.png'),
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator('.sku')).toContainText(largeVariant.sku);
    await page.goto(`/products/${draft.id}?variant=unavailable`);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Цей варіант більше недоступний',
    );
    await expect(
      page.getByRole('button', { name: 'Скопіювати повідомлення' }),
    ).toHaveCount(0);
    await page.goto(`/?q=${smallVariant.sku}&minPrice=30`);
    await expect(
      page.getByRole('heading', { name: 'Нічого не знайдено' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Фільтри/ }).click();
    await page
      .getByRole('button', { name: 'Скинути фільтри', exact: true })
      .click();
    await expect(page).toHaveURL(`/?q=${smallVariant.sku}`);
    await page.goto('/?minPrice=40&maxPrice=20');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Перевірте фільтри',
    );
    const unpublished = await published.json();
    const unpublish = await request.put(`/api/admin/products/${draft.id}`, {
      headers: { origin: 'http://127.0.0.1:3000', 'x-hhs-csrf': '1' },
      data: {
        ...body,
        updatedAt: unpublished.updatedAt,
        variants: body.variants.map((v) => ({
          ...v,
          id: draft.variants.find(
            (x: { sku: string }) => x.sku === v.sku.toUpperCase(),
          ).id,
        })),
      },
    });
    expect(unpublish.ok(), await unpublish.text()).toBeTruthy();
    await page.goto(`/products/${draft.id}`);
    await expect(
      page.getByRole('heading', { name: 'Товар не знайдено' }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
