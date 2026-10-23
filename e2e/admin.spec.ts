import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createApp } from '../apps/api/src/app.ts';
import { createCustomerService } from '../apps/api/src/services/customer.ts';
import { createAdminService } from '../apps/api/src/services/admin.ts';
import {
  createAuthService,
  databaseAuthStore,
} from '../apps/api/src/services/auth.ts';
import { attachRealtime } from '../apps/api/src/realtime.ts';
import { db, pool } from '../apps/api/src/db/client.ts';
import { env } from '../apps/api/src/env.ts';
import { adminItemInputSchema, formatMoney } from '@kape/shared';
const customer = createCustomerService(db);
const auth = createAuthService(databaseAuthStore(db), {
  secret: env.JWT_SECRET,
  production: false,
  demoMode: true,
  ...(env.DEMO_PASSWORD ? { demoPassword: env.DEMO_PASSWORD } : {}),
});
const admin = createAdminService(db, customer, {
  resetEnabled: false,
  customerBaseUrl: 'http://localhost:5173',
  reset: async () => {
    throw new Error('Never reset the shared database in browser tests');
  },
});
const server = createServer(
  createApp({
    auth,
    admin,
    customer,
    webOrigin: 'http://localhost:5173',
    probe: async () => {
      await pool.query('SELECT 1');
    },
  }),
);
const sockets = attachRealtime(server, customer, 'http://localhost:5173', auth);
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
test('admin changes item price and availability; open customer menu updates live', async ({
  page,
  browser,
}) => {
  const original = (await customer.menu()).items.find(
    (item) => item.name === 'Spanish Latte',
  );
  if (!original) throw new Error('Seed Spanish Latte required');
  const { id: originalId, ...originalInput } = original;
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const staff = await context.newPage();
  staff.setDefaultTimeout(15000);
  try {
    await page.goto('/t/5');
    await expect(
      page.getByRole('button', {
        name: 'Customize Spanish Latte',
        exact: true,
      }),
    ).toBeVisible();
    await staff.goto('http://localhost:5173/login?role=admin');
    await expect(staff.getByLabel('Email', { exact: true })).toHaveValue(
      'admin@example.com',
    );
    await staff.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      staff.getByRole('heading', { name: 'Today at a glance' }),
    ).toBeVisible();
    await expect(
      staff.getByText('Orders today', { exact: true }),
    ).toBeVisible();
    await staff.screenshot({
      path: 'qa/admin-dashboard-tablet.png',
      fullPage: true,
    });
    await staff.getByRole('button', { name: 'Menu', exact: true }).click();
    await staff
      .getByRole('button', { name: 'Edit Spanish Latte', exact: true })
      .click();
    const editor = staff.getByRole('dialog', { name: 'Edit menu item' });
    const newPrice = original.priceCents + 100;
    await editor
      .getByLabel('Price in cents', { exact: true })
      .fill(String(newPrice));
    await editor.getByLabel('Available for ordering').uncheck();
    await editor
      .getByRole('button', { name: 'Save item', exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const button = page.getByRole('button', {
      name: 'Customize Spanish Latte',
      exact: true,
    });
    await expect(button).toBeDisabled({ timeout: 5000 });
    await expect(
      page.locator('article').filter({
        has: page.getByRole('heading', {
          name: 'Spanish Latte',
          exact: true,
        }),
      }),
    ).toContainText(formatMoney(newPrice), { timeout: 5000 });
    await staff
      .getByRole('button', { name: 'Edit Spanish Latte', exact: true })
      .click();
    await editor.getByLabel('Available for ordering').check();
    await editor
      .getByRole('button', { name: 'Save item', exact: true })
      .click();
    await expect(button).toBeEnabled({ timeout: 5000 });
    await staff
      .getByRole('button', { name: 'Order history', exact: true })
      .click();
    await expect(
      staff.getByRole('heading', { name: 'Order history', exact: true }),
    ).toBeVisible();
    await expect(staff.locator('.admin-table tbody tr').first()).toBeVisible();
    await staff
      .getByRole('button', { name: /View #/ })
      .first()
      .click();
    await expect(
      staff.getByRole('dialog', { name: 'Order detail' }),
    ).toBeVisible();
    await staff.keyboard.press('Escape');
    await staff
      .getByRole('button', { name: 'Table QR codes', exact: true })
      .click();
    await staff
      .getByRole('combobox', { name: 'Table', exact: true })
      .selectOption('5');
    await expect(staff.locator('.qr-url')).toHaveText(
      'http://localhost:5173/t/5',
    );
    await expect(
      staff.getByRole('link', { name: 'Download PNG' }),
    ).toBeVisible();
    const downloadPromise = staff.waitForEvent('download');
    await staff.getByRole('link', { name: 'Download PNG' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('table-5.png');
    await staff.emulateMedia({ media: 'print' });
    await staff.screenshot({ path: 'qa/admin-qr-print.png' });
    await staff.emulateMedia({ media: 'screen' });
    await staff
      .getByRole('button', { name: 'Demo reset', exact: true })
      .click();
    await expect(
      staff.getByText('Reset is disabled by the server configuration.'),
    ).toBeVisible();
    expect(
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await admin.item(originalId, adminItemInputSchema.parse(originalInput));
    await context.request.post('http://localhost:3001/logout', {
      headers: { Origin: 'http://localhost:5173' },
      data: {},
    });
    await context.close();
  }
});
