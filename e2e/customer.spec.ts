import { test, expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createCustomerService } from '../apps/api/src/services/customer.ts';
import { db, pool } from '../apps/api/src/db/client.ts';
import { orders } from '../apps/api/src/db/schema.ts';
import { createServer } from 'node:http';
import { createApp } from '../apps/api/src/app.ts';
import { attachRealtime } from '../apps/api/src/realtime.ts';

const service = createCustomerService(db);
const server = createServer(
  createApp({
    customer: service,
    webOrigin: 'http://localhost:5173',
    probe: async () => {
      await pool.query('SELECT 1');
    },
  }),
);
const sockets = attachRealtime(server, service, 'http://localhost:5173');
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
test('375px customer customizes, orders and sees status changes without refreshing', async ({
  page,
}) => {
  let orderId: string | undefined;
  try {
    await page.goto('/t/5');
    await expect(
      page.getByRole('heading', { name: 'The menu', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.table-pill')).toContainText('Table 5');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: 'qa/menu-375.png', fullPage: true });
    await page.getByRole('button', { name: /View your order/ }).click();
    await expect(
      page.getByText('Your order is empty.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Explore the menu' }).click();
    await expect(
      page.getByRole('button', {
        name: 'Customize Almond Pain au Chocolat',
        exact: true,
      }),
    ).toBeDisabled();
    const customize = page.getByRole('button', {
      name: 'Customize Spanish Latte',
      exact: true,
    });
    await customize.click();
    const detail = page.getByRole('dialog', { name: 'Make it yours' });
    await expect(
      detail.getByRole('button', { name: /Add to order/ }),
    ).toBeDisabled();
    await detail.getByLabel('Large').check();
    for (let index = 0; index < 12; index++) await page.keyboard.press('Tab');
    expect(
      await detail.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await detail.getByLabel('Extra espresso shot').check();
    await detail
      .getByLabel('A little note for the kitchen')
      .fill('Less ice, please');
    await page.screenshot({ path: 'qa/item-375.png' });
    await page.keyboard.press('Escape');
    await expect(customize).toBeFocused();
    await customize.press('Enter');
    await detail.getByLabel('Large').check();
    await detail.getByLabel('Extra espresso shot').check();
    await detail
      .getByLabel('A little note for the kitchen')
      .fill('Less ice, please');
    await detail.getByRole('button', { name: /Add to order/ }).click();
    await page.getByRole('button', { name: /View your order/ }).click();
    const cart = page.getByRole('dialog', { name: 'Your order · Table 5' });
    await cart.getByRole('button', { name: 'Increase Spanish Latte' }).click();
    await expect(cart.locator('.cart-total')).toContainText('490.00');
    await cart.getByRole('button', { name: 'Close', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: /View your order/ }).click();
    await expect(cart.locator('.cart-total')).toContainText('490.00');
    await page.screenshot({ path: 'qa/cart-375.png' });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/orders') &&
        response.request().method() === 'POST',
    );
    await cart
      .getByRole('button', { name: 'Place order', exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string; totalCents: number };
    orderId = body.id;
    expect(body.totalCents).toBe(49000);
    await expect(page).toHaveURL('/orders/' + body.id);
    await expect(
      page.getByRole('heading', { name: 'You’re in good hands.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Live updates connected', { exact: false }),
    ).toBeVisible();
    // Real service in the test-owned API emits after commit; no test route is exposed.
    await service.setStatus(body.id, 'preparing');
    await expect(page.locator('[aria-current="step"]')).toContainText(
      'Preparing',
      { timeout: 5000 },
    );
    // A transport close (not a server disconnect command) exercises automatic reconnect.
    for (const socket of sockets.sockets.sockets.values()) socket.conn.close();
    await service.setStatus(body.id, 'ready');
    await expect(page.locator('[aria-current="step"]')).toContainText('Ready');
    await page.screenshot({ path: 'qa/tracking-375.png', fullPage: true });
    await service.setStatus(body.id, 'served');
    await expect(
      page.getByRole('heading', { name: 'Enjoy your little pause.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/t/5');
    await expect(
      page.getByRole('heading', { name: 'The menu', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'qa/menu-desktop.png', fullPage: true });
  } finally {
    if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
  }
});
