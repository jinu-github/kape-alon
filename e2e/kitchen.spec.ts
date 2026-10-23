import { test, expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createAdminService } from '../apps/api/src/services/admin.ts';
import { createServer } from 'node:http';
import { createCustomerService } from '../apps/api/src/services/customer.ts';
import {
  createAuthService,
  databaseAuthStore,
} from '../apps/api/src/services/auth.ts';
import { db, pool } from '../apps/api/src/db/client.ts';
import { orders } from '../apps/api/src/db/schema.ts';
import { env } from '../apps/api/src/env.ts';
import { createApp } from '../apps/api/src/app.ts';
import { attachRealtime } from '../apps/api/src/realtime.ts';

const service = createCustomerService(db);
const auth = createAuthService(databaseAuthStore(db), {
  secret: env.JWT_SECRET,
  production: false,
  demoMode: true,
  ...(env.DEMO_PASSWORD ? { demoPassword: env.DEMO_PASSWORD } : {}),
});
const server = createServer(
  createApp({
    customer: service,
    admin: createAdminService(db, service, {
      resetEnabled: false,
      customerBaseUrl: 'http://localhost:5173',
      reset: async () => {
        throw new Error('Reset disabled in this test');
      },
    }),
    auth,
    webOrigin: 'http://localhost:5173',
    probe: async () => {
      await pool.query('SELECT 1');
    },
  }),
);
const sockets = attachRealtime(server, service, 'http://localhost:5173', auth);
test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(3001, resolve);
  });
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await pool.end();
});

test('customer order arrives at tablet kitchen and every status updates tracking live', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const kitchen = await context.newPage();
  let orderId: string | undefined;
  try {
    await kitchen.goto('http://localhost:5173/');
    await kitchen
      .getByRole('link', { name: 'Open kitchen board', exact: true })
      .click();
    await expect(kitchen.getByLabel('Email', { exact: true })).toHaveValue(
      'kitchen@example.com',
    );
    await kitchen.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      kitchen.getByRole('heading', { name: 'Kitchen board' }),
    ).toBeVisible();
    await expect(
      kitchen.getByText('Live updates connected', { exact: false }),
    ).toBeVisible();
    expect(
      await kitchen.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.goto('/t/5');
    await page
      .getByRole('button', { name: 'Customize Spanish Latte', exact: true })
      .click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Large').check();
    await sheet.getByLabel('Extra espresso shot').check();
    await sheet
      .getByLabel('A little note for the kitchen')
      .fill('Phase 3A: less ice');
    await sheet.getByRole('button', { name: /Add to order/ }).click();
    await page.getByRole('button', { name: /View your order/ }).click();
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/orders') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Place order', exact: true })
      .click();
    const body = (await (await created).json()) as { id: string };
    orderId = body.id;
    await expect(page).toHaveURL('/orders/' + body.id);
    await expect(
      page.getByText('Live updates connected', { exact: false }),
    ).toBeVisible();
    const ticket = kitchen.getByTestId('ticket-' + body.id);
    await expect(ticket).toBeVisible({ timeout: 5000 });
    await expect(ticket).toContainText('Large');
    await expect(ticket).toContainText('Extra espresso shot');
    await expect(ticket).toContainText('Phase 3A: less ice');
    await expect(ticket).toHaveClass(/ticket-new/);
    await kitchen.screenshot({ path: 'qa/kitchen-tablet.png', fullPage: true });
    // The authenticated route rejects skipped transitions before any DB update.
    const invalidStatus = await kitchen.evaluate(
      async (id) =>
        (
          await fetch(
            'http://localhost:3001/kitchen/orders/' + id + '/status',
            {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'served' }),
            },
          )
        ).status,
      body.id,
    );
    expect(invalidStatus).toBe(409);
    for (const [action, status] of [
      ['Start preparing', 'Preparing'],
      ['Mark ready', 'Ready'],
      ['Mark served', 'Served'],
    ] as const) {
      await ticket.getByRole('button', { name: action, exact: true }).click();
      await expect(page.locator('[aria-current="step"]')).toContainText(
        status,
        { timeout: 5000 },
      );
    }
    await expect(ticket).toHaveCount(0);
    await kitchen
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
    await expect(kitchen).toHaveURL('http://localhost:5173/');
    await kitchen.goto('http://localhost:5173/kitchen');
    await expect(
      kitchen.getByRole('heading', { name: 'Kitchen sign in' }),
    ).toBeVisible();
    await kitchen.goto('http://localhost:5173/login?role=admin');
    await expect(kitchen.getByLabel('Email', { exact: true })).toHaveValue(
      'admin@example.com',
    );
    await kitchen.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(kitchen).toHaveURL('http://localhost:5173/admin');
    await expect(
      kitchen.getByRole('heading', { name: 'Cafe management' }),
    ).toBeVisible();
    await kitchen
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
  } finally {
    await context.request.post('http://localhost:3001/logout', {
      headers: { Origin: 'http://localhost:5173' },
      data: {},
    });
    await context.close();
    if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
  }
});

test('changed menu layout keeps tabs in sync, dialogs stable and final cards clear at 375px', async ({
  page,
}) => {
  await page.goto('/t/5');
  await expect(
    page.getByRole('heading', { name: 'The menu', exact: true }),
  ).toBeVisible();
  const width = await page
    .locator('.menu-main')
    .evaluate((element) => element.getBoundingClientRect().width);
  await page
    .getByRole('button', { name: 'Customize Spanish Latte', exact: true })
    .click();
  expect(
    await page
      .locator('.menu-main')
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(width);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /View your order/ }).click();
  expect(
    await page
      .locator('.menu-main')
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(width);
  await page.keyboard.press('Escape');
  await page.locator('.menu-category').last().scrollIntoViewIfNeeded();
  await expect(
    page.locator('.category-tabs [aria-current="location"]'),
  ).toHaveText(/Cold Drinks/);
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  );
  const last = await page.locator('.menu-category').last().boundingBox();
  const bar = await page.locator('.cart-bar').boundingBox();
  expect(last!.y + last!.height).toBeLessThan(bar!.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const urls = await page
    .locator('.menu-grid img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  expect(new Set(urls).size).toBeGreaterThanOrEqual(5);
  await page.screenshot({ path: 'qa/menu-fixes-375.png' });
});
