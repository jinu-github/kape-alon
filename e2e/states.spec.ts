import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedDataSchema } from '../apps/api/seed/schema.ts';

const seed = seedDataSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../apps/api/seed/seed-data.json', import.meta.url),
      'utf8',
    ),
  ),
);
test('menu loading, server error, retry and empty states at 375px', async ({
  page,
}) => {
  let mode: 'error' | 'empty' = 'error';
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('http://localhost:3001/tables/5', async (route) => {
    await gate;
    await route.fulfill({ json: { number: 5, active: true } });
  });
  await page.route('http://localhost:3001/menu', async (route) => {
    await route.fulfill(
      mode === 'error'
        ? {
            status: 503,
            json: {
              error: {
                code: 'UNAVAILABLE',
                message: 'The cafe is temporarily unavailable.',
              },
            },
          }
        : { json: { categories: seed.categories, items: [] } },
    );
  });
  await page.goto('/t/5');
  await expect(
    page.getByText('The server may be waking up', { exact: false }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('alert')).toContainText(
    'The cafe is temporarily unavailable.',
  );
  mode = 'empty';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'The menu is taking a little break.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('invalid table and missing order links give helpful errors', async ({
  page,
}) => {
  await page.goto('/t/0');
  await expect(page.getByRole('alert')).toContainText(
    'Scan the QR code on your table',
  );
  await page.route('http://localhost:3001/orders/*', (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'This order could not be found.',
        },
      },
    }),
  );
  await page.goto('/orders/7d3690d9-08f4-4c0d-9e65-88355ddf1782');
  await expect(page.getByRole('alert')).toContainText(
    'This order could not be found.',
  );
});
test('search with no results can recover and cancelled orders stay clear', async ({
  page,
}) => {
  await page.route('http://localhost:3001/tables/5', (route) =>
    route.fulfill({ json: { number: 5, active: true } }),
  );
  await page.route('http://localhost:3001/menu', (route) =>
    route.fulfill({
      json: { categories: seed.categories, items: seed.menuItems },
    }),
  );
  await page.goto('/t/5');
  await page.getByRole('searchbox').fill('nothing-matches-this');
  await expect(
    page.getByRole('heading', { name: 'No matches just yet.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(
    page.getByRole('heading', { name: 'Spanish Latte' }),
  ).toBeVisible();
  await page.route('http://localhost:3001/orders/*', (route) =>
    route.fulfill({
      json: {
        id: '7d3690d9-08f4-4c0d-9e65-88355ddf1782',
        tableNumber: 5,
        status: 'cancelled',
        notes: '',
        totalCents: 11000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          {
            id: '7d3690d9-08f4-4c0d-9e65-88355ddf1783',
            name: 'Alon Espresso',
            quantity: 1,
            unitPriceCents: 11000,
            notes: '',
            choices: [],
          },
        ],
      },
    }),
  );
  await page.goto('/orders/7d3690d9-08f4-4c0d-9e65-88355ddf1782');
  await expect(
    page.getByRole('heading', { name: 'Your order was cancelled.' }),
  ).toBeVisible();
  await expect(
    page.getByText('This order is closed.', { exact: false }),
  ).toBeVisible();
});
