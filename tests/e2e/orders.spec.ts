import { test, expect } from '@playwright/test';
import { adminFixture } from '../../apps/api/test/e2e-fixture';
test('admin reviews, creates, cancels and fulfills orders with stock history', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const fixture = await adminFixture(),
    m = fixture.marker;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: object) {
    const r = await page.request.post(`/api/admin/${path}`, {
      headers: { origin: 'http://127.0.0.1:3000', 'x-hhs-csrf': '1' },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  async function get(path: string) {
    const r = await page.request.get(`/api/admin/${path}`);
    expect(r.ok()).toBeTruthy();
    return r.json();
  }
  try {
    await page.goto('/admin/orders');
    await page.getByLabel('Електронна пошта').fill(fixture.email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    await expect(page).toHaveURL('/admin/categories');
    const c = await post('references/categories', {
        name: `Перлини ${m}`,
        parentId: null,
      }),
      u = await post('references/units', {
        name: `Штука ${m}`,
        symbol: `шт-${m}`,
        allowsFraction: false,
      }),
      w = await post('references/warehouses', {
        name: `Склад ${m}`,
        address: '',
      }),
      s = await post('references/suppliers', {
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
    const p = await post('products', {
      name: `Перлини ${m}`,
      categoryId: c.id,
      description: '',
      tags: [],
      attributes: [],
      archived: false,
      variants: [
        {
          sku: `${m}-A`,
          name: 'Нитка 4 мм',
          unitId: u.id,
          status: 'PUBLISHED',
          sellPrice: '12.50',
          archived: false,
          attributes: [{ attributeId: attribute.id, valueId: small.id }],
        },
        {
          sku: `${m}-B`,
          name: 'Нитка 8 мм',
          unitId: u.id,
          status: 'PUBLISHED',
          sellPrice: '3',
          archived: false,
          attributes: [{ attributeId: attribute.id, valueId: large.id }],
        },
      ],
    });
    const supply = await post('inventory/supplies', {
      reference: `SUP-${m}`,
      warehouseId: w.id,
      supplierId: s.id,
      items: p.variants.map((v: { id: string }) => ({
        variantId: v.id,
        quantity: '2',
        unitCost: '1',
      })),
    });
    await post(`inventory/supplies/${supply.id}/receive`, {
      revision: supply.revision,
    });
    const addSku = async (sku: string) => {
      await page
        .getByRole('button', { name: 'Додати SKU', exact: true })
        .click();
      await page.getByLabel('Пошук SKU', { exact: true }).fill(sku);
      await page
        .locator('.picker-options')
        .getByRole('button', { name: new RegExp(sku) })
        .click();
    };
    async function reviewOrder() {
      await page.goto('/admin/orders/new');
      const group = page.getByRole('group', { name: 'Склад', exact: true });
      await group
        .getByRole('button', { name: 'Вибрати…', exact: true })
        .click();
      await group.getByLabel('Пошук: Склад', { exact: true }).fill(w.name);
      await group
        .locator('.picker-options')
        .getByRole('button', { name: w.name, exact: true })
        .click();
      await page.getByLabel('Покупець', { exact: true }).fill(`Ірина ${m}`);
      await page
        .getByLabel('Instagram або контакт', { exact: true })
        .fill(`@${m}`);
      for (const v of p.variants) {
        await addSku(v.sku);
        await page
          .getByLabel(`Кількість · ${v.sku}`, { exact: true })
          .fill('2');
      }
      await page
        .getByRole('button', { name: 'Перевірити замовлення', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Перевірте перед збереженням' }),
      ).toBeVisible();
      await expect(page.locator('.order-total')).toHaveText(/31,00/);
    }
    await reviewOrder();
    await page.screenshot({
      path: testInfo.outputPath('order-review.png'),
      fullPage: true,
    });
    expect(
      (await get(`inventory/balances?warehouseId=${w.id}&q=${m}`)).items.every(
        (v: { quantity: string }) => v.quantity === '2',
      ),
    ).toBe(true);
    // Lose the first successful response, then retry the identical request.
    let lostResponse = false;
    const attempts: unknown[] = [];
    await page.route('**/api/admin/orders', async (route) => {
      attempts.push(route.request().postDataJSON());
      if (lostResponse) return route.continue();
      lostResponse = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Тимчасова помилка зв’язку' }),
      });
    });
    await page
      .getByRole('button', { name: 'Створити й списати запаси' })
      .click();
    await expect(page.locator('.form-error')).toContainText(
      'Тимчасова помилка',
    );
    await expect(
      page.getByRole('button', { name: 'Редагувати', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Повторити збереження', exact: true })
      .click();

    await expect(page).toHaveURL(/\/orders\/[a-f0-9-]{36}$/, {
      timeout: 15000,
    });
    const firstUrl = page.url();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    await page.unroute('**/api/admin/orders');

    await expect(
      page
        .getByRole('status', { name: '' })
        .filter({ hasText: 'Підтверджено' }),
    ).toBeVisible();
    expect(
      (await get(`inventory/balances?warehouseId=${w.id}&q=${m}`)).items.every(
        (v: { quantity: string }) => v.quantity === '0',
      ),
    ).toBe(true);
    page.on('dialog', (d) => d.accept());
    await page.getByLabel('Причина скасування').fill('Покупець передумав');
    await page
      .getByRole('button', { name: 'Скасувати й повернути запаси' })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Скасовано' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Причина: Покупець передумав', { exact: false }),
    ).toBeVisible();
    expect(
      (await get(`inventory/balances?warehouseId=${w.id}&q=${m}`)).items.every(
        (v: { quantity: string }) => v.quantity === '2',
      ),
    ).toBe(true);
    await page
      .getByRole('link', { name: 'Рух запасів цього замовлення' })
      .click();
    await expect(page.locator('article')).toHaveCount(4);
    await expect(
      page.locator(`article a[href="${new URL(firstUrl).pathname}"]`),
    ).toHaveCount(4);
    await reviewOrder();
    await page
      .getByRole('button', { name: 'Створити й списати запаси' })
      .click();
    await expect(page).toHaveURL(/\/orders\/[a-f0-9-]{36}$/, {
      timeout: 15000,
    });
    await page
      .getByRole('button', { name: 'Позначити виконаним', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Виконано' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Скасувати й повернути запаси' }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('order-fulfilled.png'),
      fullPage: true,
    });
    expect(
      (await get(`inventory/balances?warehouseId=${w.id}&q=${m}`)).items.every(
        (v: { quantity: string }) => v.quantity === '0',
      ),
    ).toBe(true);
    await page.goto('/admin/orders');
    await page.getByLabel('Пошук', { exact: true }).fill(m);
    await page
      .getByRole('combobox', { name: 'Статус', exact: true })
      .selectOption('FULFILLED');
    await page
      .getByRole('button', { name: 'Застосувати', exact: true })
      .click();
    await expect(page.getByText('Знайдено: 1', { exact: true })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
