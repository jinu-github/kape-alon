import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
import { io as client } from 'socket.io-client';
import { createApp } from './app.ts';
import { attachRealtime } from './realtime.ts';
import { createAuthService } from './services/auth.ts';
import type { AuthStore } from './services/auth.ts';
import type { CustomerService } from './services/customer.ts';
import type { StaffUser } from '@kape/shared';

const origin = 'http://localhost:5173';
const secret = 'test-only-secret-with-at-least-32-characters';
const kitchen: StaffUser = {
  id: randomUUID(),
  email: 'kitchen@example.com',
  role: 'kitchen',
};
const admin: StaffUser = {
  id: randomUUID(),
  email: 'admin@example.com',
  role: 'admin',
};
const sessions = new Map<string, { userId: string; expires: Date }>();
let passwordHash = '';
const store: AuthStore = {
  findByEmail: async (email) => {
    const user = [kitchen, admin].find((user) => user.email === email);
    return user ? { ...user, passwordHash } : undefined;
  },
  createSession: async (id, userId, expires) => {
    sessions.set(id, { userId, expires });
  },
  readSession: async (id, userId) => {
    const session = sessions.get(id);
    return session && session.userId === userId && session.expires > new Date()
      ? [kitchen, admin].find((user) => user.id === userId)
      : undefined;
  },
  deleteSession: async (id) => {
    sessions.delete(id);
  },
  demoUser: async (role) => (role === 'admin' ? admin : kitchen),
};
const auth = createAuthService(store, {
  secret,
  production: false,
  demoMode: false,
});
const unused = async (): Promise<never> => {
  throw new Error('Unexpected customer service call');
};
const customer: CustomerService = {
  events: new EventEmitter(),
  activeOrders: async () => [],
  menu: unused,
  table: unused,
  order: unused,
  create: unused,
  setStatus: unused,
};
const server = createServer(
  createApp({ auth, customer, webOrigin: origin, probe: async () => {} }),
);
const sockets = attachRealtime(server, customer, origin, auth);
let base = '';
const post = (
  path: string,
  body: unknown,
  cookie = '',
  requestOrigin = origin,
) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
async function login(email = kitchen.email) {
  const response = await post('/login', { email, password: 'test-password' });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!;
  return { response, cookie, header: cookie.split(';')[0]! };
}
beforeAll(async () => {
  passwordHash = await bcrypt.hash('test-password', 4);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
});

describe('staff authentication and authorization', () => {
  it('sets a host-only httpOnly Lax cookie and returns only safe profile fields', async () => {
    const { response, cookie, header } = await login();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Domain=');
    expect(await response.json()).toEqual(kitchen);
    expect(
      await (await fetch(base + '/me', { headers: { Cookie: header } })).json(),
    ).toEqual(kitchen);
  });
  it('uses Secure SameSite=None and __Host- in production', () => {
    const production = createAuthService(store, {
      secret,
      production: true,
      demoMode: false,
    });
    expect(production.cookieName).toBe('__Host-kape_session');
    expect(production.cookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
  });
  it('rejects absent, forged and expired JWTs', async () => {
    expect((await fetch(base + '/me')).status).toBe(401);
    await expect(
      auth.authenticate('kape_session=forged'),
    ).rejects.toMatchObject({ status: 401 });
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(kitchen.id)
      .setJti(randomUUID())
      .setIssuer('kape-api')
      .setAudience('kape-staff')
      .setExpirationTime(1)
      .sign(new TextEncoder().encode(secret));
    await expect(
      auth.authenticate('kape_session=' + expired),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rejects wrong passwords and unknown accounts without distinguishing them', async () => {
    const bad = await post('/login', {
      email: kitchen.email,
      password: 'wrong-password',
    });
    const unknown = await post('/login', {
      email: 'nobody@example.com',
      password: 'wrong-password',
    });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await bad.json()).toEqual(await unknown.json());
    expect((await post('/login', { email: 'bad', password: 'x' })).status).toBe(
      400,
    );
  });
  it('enforces roles and CSRF origins and keeps demo credentials opt-in', async () => {
    expect((await fetch(base + '/kitchen/orders')).status).toBe(401);
    const { header } = await login();
    expect(
      (await fetch(base + '/kitchen/orders', { headers: { Cookie: header } }))
        .status,
    ).toBe(200);
    expect(
      (await fetch(base + '/admin/access', { headers: { Cookie: header } }))
        .status,
    ).toBe(403);
    const adminLogin = await login(admin.email);
    expect(
      (
        await fetch(base + '/admin/access', {
          headers: { Cookie: adminLogin.header },
        })
      ).status,
    ).toBe(200);
    expect(
      (await post('/logout', {}, header, 'https://foreign.example')).status,
    ).toBe(403);
    expect((await post('/logout', {}, header, '')).status).toBe(403);
    expect((await fetch(base + '/demo-access/kitchen')).status).toBe(404);
  });
  it('rejects unauthenticated kitchen sockets and revokes live sockets and copied JWTs on logout', async () => {
    const unauthorized = client(base + '/kitchen', {
      extraHeaders: { Origin: origin },
      reconnection: false,
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      unauthorized.once('connect_error', () => {
        unauthorized.close();
        resolve();
      });
      unauthorized.once('connect', () => {
        unauthorized.close();
        reject(new Error('Unauthenticated socket connected'));
      });
    });
    const { header } = await login();
    const socket = client(base + '/kitchen', {
      extraHeaders: { Origin: origin, Cookie: header },
      forceNew: true,
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const disconnected = new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
      });
      expect((await post('/logout', {}, header)).status).toBe(204);
      await disconnected;
      expect(
        (await fetch(base + '/me', { headers: { Cookie: header } })).status,
      ).toBe(401);
    } finally {
      socket.close();
    }
  });
  it('limits repeated login attempts', async () => {
    let response: Response | undefined;
    for (let i = 0; i < 12; i++) response = await post('/login', {});
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBeTruthy();
  });
});
