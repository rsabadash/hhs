import { test, expect, type Locator } from '@playwright/test';
import { adminFixture } from '../../apps/api/test/e2e-fixture';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
test('admin creates and edits two SKU variants, filters them, and previews shared images', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const fixture = await adminFixture();
  const marker = fixture.marker;
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  async function choose(scope: Locator, label: string, text: string) {
    const picker = scope.locator('.catalog-picker').filter({
      has: page.locator('.field-label', {
        hasText: new RegExp(`^${label}$`),
      }),
    });
    await picker.getByRole('button', { name: 'Вибрати…', exact: true }).click();
    await picker.getByLabel(`Пошук: ${label}`, { exact: true }).fill(text);
    await picker
      .locator('.picker-options')
      .getByRole('button', { name: text, exact: false })
      .click();
  }
  async function ref(kind: string, data: object) {
    const r = await page.request.post(`/api/admin/references/${kind}`, {
      headers: { origin: 'http://127.0.0.1:3000', 'x-hhs-csrf': '1' },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  try {
    await page.goto('/admin/products');
    await page.getByLabel('Електронна пошта').fill(fixture.email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    await expect(page).toHaveURL('/admin/categories');
    await ref('categories', { name: `Перлини ${marker}`, parentId: null });
    await ref('units', {
      name: `Штука ${marker}`,
      symbol: marker,
      allowsFraction: false,
    });
    const attribute = await ref('attributes', {
      name: `Діаметр ${marker}`,
      kind: 'NUMBER',
      measurementSymbol: 'мм',
    });
    const small = await ref('attribute-values', {
      attributeId: attribute.id,
      label: '4',
      numericValue: '4',
    });
    await ref('attribute-values', {
      attributeId: attribute.id,
      label: '8',
      numericValue: '8',
    });
    await page.goto('/admin/products/new');
    await page
      .getByLabel('Назва товару', { exact: true })
      .fill(`Нитка з перлин ${marker}`);
    await choose(
      page.locator('.catalog-page'),
      'Категорія',
      `Перлини ${marker}`,
    );
    await page
      .getByLabel('Теги через кому')
      .fill(`${marker} перлини, ${marker} натуральні`);
    await page
      .getByRole('button', { name: 'Додати варіант', exact: true })
      .click();
    for (let i = 0; i < 2; i++) {
      const variant = page.locator('.variant-card').nth(i);
      await variant
        .getByLabel('Назва варіанта', { exact: true })
        .fill(i ? '8 мм' : '4 мм');
      await variant
        .getByLabel('SKU', { exact: true })
        .fill(`${marker}-${i + 1}`);
      await choose(variant, 'Одиниця продажу', `Штука ${marker}`);
      await variant.getByLabel('Ціна продажу, грн').fill(i ? '100' : '10.50');
      await variant
        .getByRole('button', { name: 'Додати атрибут', exact: true })
        .click();
      await choose(variant, 'Атрибут', `Діаметр ${marker}`);
      await choose(variant, 'Значення', i ? '8' : '4');
      await variant
        .getByLabel('Публікація')
        .selectOption(i ? 'PUBLISHED' : 'DRAFT');
    }
    await page
      .getByRole('button', { name: 'Зберегти товар', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]{36}$/, {
      timeout: 15000,
    });
    const productId = page.url().split('/').pop()!;
    await expect(
      page.getByRole('heading', { name: 'Редагувати товар', exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Опис', { exact: true })
      .fill('Натуральні річкові перлини');
    const savedResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/admin/products/${productId}`) &&
        r.request().method() === 'PUT',
    );
    await page
      .getByRole('button', { name: 'Зберегти товар', exact: true })
      .click();
    expect((await savedResponse).status()).toBe(200);
    await expect(
      page.getByRole('button', { name: 'Зберегти товар', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    // Provider-independent gallery fixture: API image ownership/deletion is covered by PostgreSQL integration tests.
    const variantRows = await pool.query(
      'SELECT id,sku FROM "Variant" WHERE "productId"=$1 ORDER BY sku',
      [productId],
    );
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQ8bX9DwAC9QGuYeB4NwAAAABJRU5ErkJggg==';
    for (const [variantId, alt] of [
      [null, 'Спільне фото'],
      [variantRows.rows[1].id, 'Фото 8 мм'],
    ]) {
      await pool.query(
        'INSERT INTO "Image" (id,"publicId",url,alt,position,"productId","variantId") VALUES ($1,$2,$3,$4,0,$5,$6)',
        [randomUUID(), `${marker}-${alt}`, png, alt, productId, variantId],
      );
    }
    await page.reload();
    await page.getByLabel('Показати для').selectOption(variantRows.rows[0].id);
    await expect(
      page.locator('.gallery-preview').getByAltText('Спільне фото'),
    ).toBeVisible();
    await page.getByLabel('Показати для').selectOption(variantRows.rows[1].id);
    await expect(
      page.locator('.gallery-preview').getByAltText('Фото 8 мм'),
    ).toBeVisible();
    await expect(
      page.locator('.gallery-preview').getByAltText('Спільне фото'),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('catalog-editor.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('catalog-editor-viewport.png'),
    });
    await page.goto(
      `/admin/products?q=${marker}&valueIds=${small.id}&minPrice=50`,
    );
    await expect(page.getByRole('status')).toContainText('Знайдено товарів: 0');
    await page.getByRole('button', { name: /^Фільтри/ }).click();
    await page.getByRole('button', { name: 'Скинути фільтри' }).click();
    await expect(page).toHaveURL('/admin/products');
    await page.getByRole('button', { name: /^Фільтри/ }).click();
    await expect(page.getByLabel('Мін. ціна, грн')).toHaveValue('');
    await page.getByRole('button', { name: 'Закрити фільтри' }).click();
    await page.getByLabel('Пошук за назвою або SKU').fill(marker);
    await page.getByRole('button', { name: 'Знайти', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Знайдено товарів: 1');
    await expect(
      page.getByText(`${marker}-1`.toUpperCase(), { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('catalog-list.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('link', { name: 'Редагувати', exact: true }).click();
    await page.getByLabel('Теги через кому').fill('');
    await page
      .getByRole('button', { name: 'Зберегти товар', exact: true })
      .click();
    await expect
      .poll(async () =>
        Number(
          (
            await pool.query('SELECT count(*) FROM "Tag" WHERE name LIKE $1', [
              `%${marker}%`,
            ])
          ).rows[0].count,
        ),
      )
      .toBe(0);
  } finally {
    await pool.end();
    await fixture.cleanup();
  }
});
