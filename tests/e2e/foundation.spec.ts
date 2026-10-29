import { checkAccessibility } from './accessibility';
import { expect, test } from '@playwright/test';

test('Ukrainian storefront loads with accessible navigation and no horizontal overflow', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Деталі, з яких починається краса.',
  );
  await expect(
    page.getByRole('searchbox', { name: 'Пошук', exact: true }),
  ).toBeVisible();
  await checkAccessibility(page);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Перейти до вмісту' }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('web reaches the API and migrated database', async ({ request }) => {
  const live = await request.get('http://127.0.0.1:4000/health/live');
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual({ status: 'ok' });
  const ready = await request.get('/api/health');
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ status: 'ok' });
  expect(ready.headers()['cache-control']).toContain('no-store');
});

test('unknown routes show a Ukrainian recovery link', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Сторінку не знайдено' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'На головну' }).click();
  await expect(page).toHaveURL('/');
});
