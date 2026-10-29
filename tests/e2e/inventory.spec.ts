import { test, expect } from '@playwright/test';
import { adminFixture } from '../../apps/api/test/e2e-fixture';
test('admin receives multiple SKUs and reconciles warehouse stock through a separate count', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const fixture = await adminFixture();
  const m = fixture.marker;
  async function post(path: string, data: object) {
    const r = await page.request.post(`/api/admin/${path}`, {
      headers: { origin: 'http://127.0.0.1:3000', 'x-hhs-csrf': '1' },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  async function pick(label: string, name: string) {
    const group = page.getByRole('group', { name: label, exact: true });
    await group.getByRole('button', { name: 'Вибрати…', exact: true }).click();
    await group.getByLabel(`Пошук: ${label}`, { exact: true }).fill(name);
    await group
      .locator('.picker-options')
      .getByRole('button', { name, exact: false })
      .click();
  }
  async function addSku(sku: string) {
    await page.getByRole('button', { name: 'Додати SKU', exact: true }).click();
    await page.getByLabel('Пошук SKU', { exact: true }).fill(sku);
    await page
      .locator('.picker-options')
      .getByRole('button', { name: new RegExp(sku) })
      .click();
  }
  try {
    await page.goto('/admin/inventory/supplies');
    await page.getByLabel('Електронна пошта').fill(fixture.email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    await expect(page).toHaveURL('/admin/categories');
    const c = await post('references/categories', {
      name: `Перлини ${m}`,
      parentId: null,
    });
    const u = await post('references/units', {
      name: `Штука ${m}`,
      symbol: `шт-${m}`,
      allowsFraction: false,
    });
    const pair = await post('references/units', {
      name: `Пара ${m}`,
      symbol: `пара-${m}`,
      allowsFraction: false,
    });
    const w = await post('references/warehouses', {
      name: `Склад ${m}`,
      address: '',
    });
    const supplier = await post('references/suppliers', {
      name: `Постачальник ${m}`,
      email: '',
      phone: '',
    });
    const make = async (suffix: string, unitId: string) =>
      post('products', {
        name: `Перлини ${m} ${suffix}`,
        categoryId: c.id,
        description: '',
        tags: [],
        attributes: [],
        archived: false,
        variants: [
          {
            sku: `${m}-${suffix}`,
            name: 'Стандарт',
            unitId,
            status: 'DRAFT',
            sellPrice: null,
            archived: false,
            attributes: [],
          },
        ],
      });
    const p1 = await make('A', u.id),
      p2 = await make('B', pair.id);
    const sku1 = p1.variants[0].sku,
      sku2 = p2.variants[0].sku;
    await page.goto('/admin/inventory/supplies/new');
    await page.getByLabel('Номер документа', { exact: true }).fill(`SUP-${m}`);
    await pick('Склад', w.name);
    await pick('Постачальник', supplier.name);
    await addSku(sku1);
    await addSku(sku2);
    await page.getByLabel(`Кількість ${sku1}`, { exact: true }).fill('5');
    await page.getByLabel(`Ціна ${sku1}`, { exact: true }).fill('2.50');
    await page.getByLabel(`Кількість ${sku2}`, { exact: true }).fill('2');
    await page.getByLabel(`Ціна ${sku2}`, { exact: true }).fill('3');
    await expect(
      page.getByText('Разом: 18.50 грн', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Зберегти чернетку', exact: true })
      .click();
    await expect(page).toHaveURL(/\/supplies\/[a-f0-9-]{36}$/);
    page.on('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Отримати постачання', exact: true })
      .click();
    await expect(page.locator('.status-pill')).toHaveText('Отримано');
    await expect(
      page.getByRole('button', { name: 'Зберегти чернетку', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('supply-received.png'),
      fullPage: true,
    });
    await page.goto(
      `/admin/inventory/balances?warehouseId=${w.id}&q=${encodeURIComponent(sku1)}`,
    );
    await expect(page.getByText(new RegExp(`5 шт-${m}`))).toBeVisible();
    await page.goto('/admin/inventory/counts/new');
    await page
      .getByLabel('Номер документа', { exact: true })
      .fill(`COUNT-${m}`);
    await pick('Склад', w.name);
    await addSku(sku1);
    await page
      .getByRole('button', { name: 'Зберегти чернетку', exact: true })
      .click();
    await expect(page).toHaveURL(/\/counts\/[a-f0-9-]{36}$/);
    await page
      .getByRole('button', { name: 'Почати підрахунок', exact: true })
      .click();
    await expect(page.locator('.status-pill')).toHaveText('Підрахунок');
    await page
      .getByLabel(`Фактична кількість ${sku1}`, { exact: true })
      .fill('3');
    await page
      .getByLabel(`Причина ${sku1}`, { exact: true })
      .fill('Перераховано вручну');
    await page
      .getByRole('button', { name: 'Зберегти підрахунок', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Провести інвентаризацію',
        exact: true,
      }),
    ).toBeEnabled();
    // A new receipt makes the physical count stale; the UI must demand recounting.
    const extra = await post('inventory/supplies', {
      reference: `EXTRA-${m}`,
      warehouseId: w.id,
      supplierId: supplier.id,
      items: [{ variantId: p1.variants[0].id, quantity: '1', unitCost: '1' }],
    });
    await post(`inventory/supplies/${extra.id}/receive`, {
      revision: extra.revision,
    });
    await page
      .getByRole('button', { name: 'Провести інвентаризацію', exact: true })
      .click();
    await expect(page.locator('.form-error[role="alert"]')).toContainText(
      'залишок змінився',
    );
    await page
      .getByRole('button', {
        name: `Оновити знімок і перерахувати ${sku1}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel(`Фактична кількість ${sku1}`, { exact: true }),
    ).toHaveValue('');
    await page
      .getByLabel(`Фактична кількість ${sku1}`, { exact: true })
      .fill('0');
    await page
      .getByLabel(`Причина ${sku1}`, { exact: true })
      .fill('Фізично відсутнє');
    await page
      .getByRole('button', { name: 'Зберегти підрахунок', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Провести інвентаризацію',
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Провести інвентаризацію', exact: true })
      .click();
    await expect(page.locator('.status-pill')).toHaveText('Проведено');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('count-posted.png'),
      fullPage: true,
    });
    await page.goto(
      `/admin/inventory/balances?warehouseId=${w.id}&q=${encodeURIComponent(sku1)}&inStock=false`,
    );
    await expect(page.getByText(new RegExp(`0 шт-${m}`))).toBeVisible();
    await page.goto(
      `/admin/inventory/balances?warehouseId=${w.id}&q=${encodeURIComponent(sku2)}`,
    );
    await expect(page.getByText(new RegExp(`2 пара-${m}`))).toBeVisible();
    await page.goto(`/admin/inventory/movements?q=COUNT-${m}`);
    await expect(
      page.getByRole('heading', { name: new RegExp('Інвентаризація · -6') }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('movements.png'),
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
