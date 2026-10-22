import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './db/schema.ts';
import { createAuthService } from './services/auth.ts';
import { createCustomerService } from './services/customer.ts';
import { createAdminService } from './services/admin.ts';
import { createApp } from './app.ts';
import type { StaffUser } from '@kape/shared';
const pool = new pg.Pool();
const database = drizzle(pool, { schema }); // No queries used by these authorization/reset tests.
const customer = createCustomerService(database);
const reset = vi.fn(async () => {});
const service = createAdminService(database, customer, {
  resetEnabled: true,
  customerBaseUrl: 'http://localhost:5173',
  reset,
});
const users: StaffUser[] = [
  { id: randomUUID(), email: 'admin@test.com', role: 'admin' },
  { id: randomUUID(), email: 'kitchen@test.com', role: 'kitchen' },
];
let hash = '';
const sessions = new Map<string, string>();
const auth = createAuthService(
  {
    findByEmail: async (email) => {
      const user = users.find((user) => user.email === email);
      return user ? { ...user, passwordHash: hash } : undefined;
    },
    createSession: async (id, userId) => {
      sessions.set(id, userId);
    },
    readSession: async (id, userId) =>
      sessions.get(id) === userId
        ? users.find((user) => user.id === userId)
        : undefined,
    deleteSession: async (id) => {
      sessions.delete(id);
    },
    demoUser: async () => undefined,
  },
  {
    secret: 'test-only-secret-at-least-32-characters',
    production: false,
    demoMode: false,
  },
);
const server = createServer(
  createApp({
    auth,
    admin: service,
    customer,
    webOrigin: 'http://localhost:5173',
    probe: async () => {},
  }),
);
let base = '';
let adminCookie = '';
let kitchenCookie = '';
beforeAll(async () => {
  hash = await bcrypt.hash('password-test', 4);
  adminCookie =
    auth.cookieName +
    '=' +
    (await auth.login(users[0]!.email, 'password-test')).token;
  kitchenCookie =
    auth.cookieName +
    '=' +
    (await auth.login(users[1]!.email, 'password-test')).token;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  base = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});
const request = (
  path: string,
  method: string,
  cookie: string,
  body?: unknown,
  origin = 'http://localhost:5173',
) =>
  fetch(base + '/admin' + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
it('protects every admin route from kitchen users and anonymous callers', async () => {
  const id = randomUUID();
  for (const [path, method] of [
    ['/menu', 'GET'],
    ['/settings', 'GET'],
    ['/dashboard', 'GET'],
    ['/orders', 'GET'],
    ['/orders/' + id, 'GET'],
    ['/categories', 'POST'],
    ['/categories/' + id, 'PUT'],
    ['/categories/' + id, 'DELETE'],
    ['/items', 'POST'],
    ['/items/' + id, 'PUT'],
    ['/items/' + id, 'DELETE'],
    ['/reset', 'POST'],
  ] as const) {
    expect((await request(path, method, kitchenCookie)).status).toBe(403);
    expect((await request(path, method, '')).status).toBe(401);
  }
});
it('validates CRUD/filter bodies before calling the database and rejects foreign origins', async () => {
  expect(
    (await request('/categories', 'POST', adminCookie, { name: ' ' })).status,
  ).toBe(400);
  expect(
    (await request('/items', 'POST', adminCookie, { priceCents: -1 })).status,
  ).toBe(400);
  expect(
    (await request('/items/not-a-uuid', 'DELETE', adminCookie)).status,
  ).toBe(400);
  expect(
    (await request('/orders?from=2026-10-23&to=2026-10-22', 'GET', adminCookie))
      .status,
  ).toBe(400);
  expect(
    (
      await request(
        '/reset',
        'POST',
        adminCookie,
        { confirmation: 'RESET DEMO DATA' },
        'https://foreign.example',
      )
    ).status,
  ).toBe(403);
});
it('requires reset confirmation and rate-limits repeated resets', async () => {
  expect(
    (await request('/reset', 'POST', adminCookie, { confirmation: 'yes' }))
      .status,
  ).toBe(400);
  expect(reset).not.toHaveBeenCalled();
  expect(
    (
      await request('/reset', 'POST', adminCookie, {
        confirmation: 'RESET DEMO DATA',
      })
    ).status,
  ).toBe(204);
  expect(
    (
      await request('/reset', 'POST', adminCookie, {
        confirmation: 'RESET DEMO DATA',
      })
    ).status,
  ).toBe(429);
  expect(reset).toHaveBeenCalledTimes(1);
  const disabled = createAdminService(database, customer, {
    resetEnabled: false,
    customerBaseUrl: 'http://localhost:5173',
    reset,
  });
  await expect(disabled.reset()).rejects.toMatchObject({ status: 403 });
  expect(reset).toHaveBeenCalledTimes(1);
});
