import { test, expect, type Page } from '@playwright/test';
import { adminFixture } from '../../apps/api/test/e2e-fixture';

test('admin creates, edits and finds reference data, then signs out', async ({
  page,
}) => {
  test.setTimeout(120000);
  const fixture = await adminFixture();
  const suffix = fixture.marker;
  async function add(page: Page, name: string) {
    await page.getByRole('button', { name: 'Додати запис' }).click();
    await page.getByLabel('Назва', { exact: true }).fill(name);
  }
  async function save() {
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: /Новий запис|Редагування запису/ }),
    ).toHaveCount(0);
  }
  try {
    await page.goto('/admin/units');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.getByLabel('Електронна пошта').fill(fixture.email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    await expect(page).toHaveURL('/admin/categories');
    await add(page, `Перлини ${suffix}`);
    await save();
    const root = page.getByRole('listitem').filter({
      has: page.getByRole('heading', {
        name: `Перлини ${suffix}`,
        exact: true,
      }),
    });
    await root.getByRole('link', { name: /Підкатегорії/ }).click();
    await expect(
      page.getByRole('heading', {
        name: `Підкатегорії: Перлини ${suffix}`,
        exact: true,
      }),
    ).toBeVisible();
    await add(page, `Річкові ${suffix}`);
    await save();
    await expect(
      page.getByRole('heading', { name: `Річкові ${suffix}`, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Одиниці', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Одиниці', exact: true }),
    ).toBeVisible();
    await add(page, `Штука ${suffix}`);
    await page.getByLabel('Позначення', { exact: true }).fill(suffix);
    await save();
    await page
      .getByRole('button', { name: `Редагувати Штука ${suffix}` })
      .click();
    await page.getByLabel('Назва', { exact: true }).fill(`Пара ${suffix}`);
    await save();
    await page.getByLabel('Пошук', { exact: true }).fill(suffix);
    await page.getByRole('button', { name: 'Знайти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Пара ${suffix}`, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Атрибути', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Атрибути', exact: true }),
    ).toBeVisible();
    await add(page, `Діаметр ${suffix}`);
    await page.getByLabel('Тип значень').selectOption('NUMBER');
    await page.getByLabel('Одиниця вимірювання').fill('мм');
    await save();
    await page
      .getByRole('listitem')
      .filter({ hasText: `Діаметр ${suffix}` })
      .getByRole('link', { name: /Значення/ })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Значення атрибута', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Додати запис' }).click();
    await page.getByLabel(/Числове значення/).fill('6');
    await save();
    await expect(
      page.getByRole('heading', { name: '6', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Склади', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Склади', exact: true }),
    ).toBeVisible();
    await add(page, `Київ ${suffix}`);
    await page
      .getByLabel('Адреса', { exact: true })
      .first()
      .fill('Київ, Україна');
    await save();
    await page
      .getByRole('link', { name: 'Постачальники', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Постачальники', exact: true }),
    ).toBeVisible();
    await add(page, `Майстерня ${suffix}`);
    await page.getByLabel('Електронна пошта').fill('supplier@example.test');
    await save();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath('admin.png'),
      fullPage: true,
    });
    const forged = await page.request.post('/api/admin/references/units', {
      data: { name: 'forged' },
      headers: { Origin: 'https://attacker.invalid', 'x-hhs-csrf': '1' },
    });
    expect(forged.status()).toBe(403);
    await page.getByRole('button', { name: 'Вийти', exact: true }).click();
    await expect(page).toHaveURL('/admin/login');
    expect(
      (await page.request.get('/api/admin/references/units')).status(),
    ).toBe(401);
    await page.getByLabel('Електронна пошта').fill(fixture.email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    await expect(page).toHaveURL('/admin/categories');
    await fixture.expire();
    await page.goto('/admin/units');
    await expect(page).toHaveURL(/expired=1/);
  } finally {
    await fixture.cleanup();
  }
});
