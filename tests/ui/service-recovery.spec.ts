import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { checkAccessibility } from '../e2e/accessibility';

let server: Server;
let unavailable = true;
let brokenPage = false;
let healthChecks = 0;
let pageReads = 0;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    const health = path === '/health/ready';
    if (health) healthChecks += 1;
    else pageReads += 1;
    res.setHeader('Content-Type', 'application/json');
    if (unavailable || (!health && brokenPage)) {
      res.writeHead(503);
      res.end(JSON.stringify({ status: 'unavailable' }));
      return;
    }
    res.end(
      JSON.stringify(
        health
          ? { status: 'ok' }
          : path === '/admin/auth/me'
            ? { email: 'ui@example.test' }
            : path === '/catalog/filters'
              ? { categories: [], tags: [], values: [] }
              : { items: [], total: 0, page: 1, pageSize: 20 },
      ),
    );
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
  unavailable = true;
  brokenPage = false;
  healthChecks = 0;
  pageReads = 0;
  await context.addCookies([
    { name: 'hhs_session', value: 'ui-only', url: 'http://127.0.0.1:3100' },
  ]);
});

for (const path of ['/?q=перлини', '/admin/products?q=перлини']) {
  test(`${path}: recovers automatically after an outage and preserves the URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: 'Запускаємо сервіс…' }),
    ).toBeVisible();
    await expect.poll(() => healthChecks).toBeGreaterThanOrEqual(2);
    await checkAccessibility(page);
    await page.screenshot({
      path: testInfo.outputPath('starting-service.png'),
    });
    unavailable = false;
    await expect(page.getByRole('searchbox')).toHaveValue('перлини', {
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get('q')).toBe('перлини');
    const completedChecks = healthChecks;
    await page.waitForTimeout(3500);
    expect(healthChecks).toBe(completedChecks);
  });
}

test('a healthy API with a broken page does not cause an automatic refresh loop', async ({
  page,
}) => {
  unavailable = false;
  brokenPage = true;
  await page.goto('/');
  await expect(
    page.getByText(
      'Сервіс відповідає, але сторінка не завантажилася. Спробуйте ще раз.',
    ),
  ).toBeVisible();
  await expect.poll(() => healthChecks).toBe(2);
  const reads = pageReads;
  await page.waitForTimeout(3500);
  expect(pageReads).toBe(reads);
  brokenPage = false;
  await page.getByRole('button', { name: 'Спробувати ще раз' }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
});

test('long outages keep checking and recover after malformed and failed health responses', async ({
  page,
}) => {
  await page.clock.install();
  let checks = 0;
  let ready = false;
  await page.route('**/api/health', async (route) => {
    checks += 1;
    if (checks === 1) return route.abort();
    if (!ready) return route.fulfill({ status: 200, body: 'not-json' });
    return route.continue();
  });
  await page.goto('/');
  await expect.poll(() => checks).toBe(1);
  await page.clock.fastForward(125_000);
  await expect(
    page.getByRole('heading', { name: 'Сервіс поки недоступний' }),
  ).toBeVisible();
  await expect.poll(() => checks).toBeGreaterThanOrEqual(2);
  ready = true;
  unavailable = false;
  await page.clock.fastForward(15_000);
  await expect(page.getByRole('searchbox')).toBeVisible();
});

test('leaving the error page stops readiness checks', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto('/');
  await expect.poll(() => healthChecks).toBe(1);
  await page.getByRole('link', { name: 'Для адміністратора' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  const checks = healthChecks;
  await page.waitForTimeout(4000);
  expect(healthChecks).toBe(checks);
});
