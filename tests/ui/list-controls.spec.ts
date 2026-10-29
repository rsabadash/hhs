import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { checkAccessibility } from '../e2e/accessibility';

const id = '11111111-1111-4111-8111-111111111111';
const valueId = '22222222-2222-4222-8222-222222222222';
const secondValueId = '33333333-3333-4333-8333-333333333333';
const reference = {
  id,
  name: 'Перлини',
  kind: 'NUMBER',
  measurementSymbol: 'мм',
  symbol: 'шт',
  allowsFraction: false,
  parentId: null,
};
let server: Server;
// Exercise the real Next pages and proxy against a local API double. No database or provider writes.
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const reply = (data: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === '/admin/auth/me')
      return reply({ email: 'ui@example.test' });
    if (url.pathname === '/catalog/filters')
      return reply({
        categories: [reference],
        tags: ['перлини'],
        values: [
          {
            id: valueId,
            label: '4',
            attribute: { id, name: 'Діаметр', measurementSymbol: 'мм' },
          },
          {
            id: secondValueId,
            label: 'Золото',
            attribute: {
              id: secondValueId,
              name: 'Покриття',
              measurementSymbol: null,
            },
          },
        ],
      });
    if (/\/references\/[^/]+\/[^/]+$/.test(url.pathname))
      return reply({ ...reference, attributeId: id, label: '4' });
    const items =
      url.pathname === '/admin/products'
        ? [
            {
              id,
              name: 'Нитка з перлин',
              category: reference,
              archivedAt: null,
              tags: [{ tag: { name: 'перлини' } }],
              variants: [
                { id, sku: 'PRL-04', sellPrice: '180', status: 'PUBLISHED' },
              ],
            },
          ]
        : url.pathname.startsWith('/admin/references/')
          ? [reference]
          : url.pathname === '/catalog'
            ? [
                {
                  id,
                  name: 'Нитка з перлин',
                  category: reference,
                  variantId: id,
                  price: '180',
                  unit: reference,
                  inStock: true,
                  image: null,
                  matchingVariants: 1,
                },
              ]
            : [];
    reply({
      items,
      total: items.length,
      page: Number(url.searchParams.get('page') || 1),
      pageSize: 20,
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(4101, '127.0.0.1', resolve),
  );
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'hhs_session', value: 'ui-only', url: 'http://127.0.0.1:3100' },
  ]);
});
const cases = [
  {
    path: '/admin/products',
    label: 'Статус',
    key: 'status',
    value: 'PUBLISHED',
  },
  { path: '/admin/orders', label: 'Статус', key: 'status', value: 'FULFILLED' },
  {
    path: '/admin/inventory/supplies',
    label: 'Статус',
    key: 'status',
    value: 'RECEIVED',
  },
  {
    path: '/admin/inventory/counts',
    label: 'Статус',
    key: 'status',
    value: 'COUNTING',
  },
  {
    path: '/admin/inventory/movements',
    label: 'Операція',
    key: 'kind',
    value: 'RECEIPT',
  },
  {
    path: '/admin/inventory/balances',
    label: 'Наявність',
    key: 'inStock',
    value: 'true',
  },
  {
    path: '/admin/categories',
    label: 'Рівень категорій',
    key: 'parentId',
    value: 'root',
  },
  {
    path: '/admin/units',
    label: 'Кількість',
    key: 'allowsFraction',
    value: 'false',
  },
  {
    path: '/admin/suppliers',
    label: 'Контакти',
    key: 'hasContact',
    value: 'true',
  },
  {
    path: '/admin/warehouses',
    label: 'Адреса',
    key: 'hasAddress',
    value: 'false',
  },
  { path: '/', label: 'Категорія', key: 'categoryId', value: id },
];
for (const c of cases)
  test(`${c.path}: search, sort, drawer and URL history`, async ({
    page,
  }, testInfo) => {
    await page.goto(`${c.path}?q=перлини&page=3`);
    const search = page.getByRole('searchbox');
    await expect(search).toHaveValue('перлини');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: c.label, exact: true }),
    ).toHaveCount(0);
    const sort = page.getByRole('combobox', {
      name: 'Сортування',
      exact: true,
    });
    const direction = (await sort.inputValue()) === 'asc' ? 'desc' : 'asc';
    await sort.selectOption(direction);
    await expect(page).toHaveURL(new RegExp(`sort=${direction}`));
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    await expect(search).toHaveValue('перлини');
    const trigger = page.getByRole('button', { name: /^Фільтри/ });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Фільтри', exact: true });
    const field = drawer.getByRole('combobox', { name: c.label, exact: true });
    const original = await field.inputValue();
    await field.selectOption(c.value);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(field).toHaveValue(original);
    await field.selectOption(c.value);
    if (c.path === '/admin/products' || c.path === '/') {
      await checkAccessibility(page);
      await page.screenshot({ path: testInfo.outputPath('filter-panel.png') });
      const footer = await drawer
        .locator('.filter-drawer-footer')
        .boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height + 1,
      );
    }
    await drawer
      .getByRole('button', { name: 'Застосувати', exact: true })
      .click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get(c.key))
      .toBe(c.value);
    await expect(drawer).toHaveCount(0);
    await search.fill('конектор');
    await page.getByRole('button', { name: 'Знайти', exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe('конектор');
    expect(new URL(page.url()).searchParams.get(c.key)).toBe(c.value);
    expect(new URL(page.url()).searchParams.get('sort')).toBe(direction);
    await page.goBack();
    await expect(search).toHaveValue('перлини');
    await trigger.click();
    await expect(field).toHaveValue(c.value);
    await drawer
      .getByRole('button', { name: 'Скинути фільтри', exact: true })
      .click();
    await expect
      .poll(() => new URL(page.url()).searchParams.has(c.key))
      .toBe(false);
    expect(new URL(page.url()).searchParams.get('q')).toBe('перлини');
    expect(new URL(page.url()).searchParams.get('sort')).toBe(direction);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (c.path === '/admin/products' || c.path === '/')
      await page.screenshot({
        path: testInfo.outputPath('list.png'),
        fullPage: true,
      });
  });

test('attribute values retain their parent context when searching and sorting', async ({
  page,
}) => {
  await page.goto(`/admin/attribute-values?attributeId=${id}`);
  await expect(page.getByRole('button', { name: /^Фільтри/ })).toHaveCount(0);
  await page.getByRole('searchbox').fill('4');
  await page.getByRole('button', { name: 'Знайти', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('4');
  await page
    .getByRole('combobox', { name: 'Сортування', exact: true })
    .selectOption('desc');
  await expect(page).toHaveURL(/sort=desc/);
  expect(new URL(page.url()).searchParams.get('attributeId')).toBe(id);
});

test('public attribute filters combine values and drawer contains keyboard focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Фільтри/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Закрити фільтри' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Застосувати', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Закрити фільтри' }),
  ).toBeFocused();
  await dialog
    .getByRole('combobox', { name: 'Діаметр, мм', exact: true })
    .selectOption(valueId);
  await dialog
    .getByRole('combobox', { name: 'Покриття', exact: true })
    .selectOption(secondValueId);
  await dialog
    .getByRole('button', { name: 'Застосувати', exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('valueIds'))
    .toBe(`${valueId},${secondValueId}`);
});
