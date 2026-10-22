import { Router } from 'express';
import { z } from 'zod';
import {
  loginSchema,
  roleSchema,
  idSchema,
  updateOrderStatusSchema,
} from '@kape/shared';
import type { AuthService } from '../services/auth.ts';
import type { CustomerService } from '../services/customer.ts';
import { ServiceError } from '../services/errors.ts';
import { requireRole, requireStaffOrigin } from '../middleware/auth.ts';

export function staffRouter(
  auth: AuthService,
  customer: CustomerService,
  origin: string,
) {
  const router = Router();
  const attempts = new Map<string, { count: number; expires: number }>();
  const empty = z.strictObject({});
  const originGuard = requireStaffOrigin(origin);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/demo-access/:role', async (req, res) => {
    empty.parse(req.query);
    res.json(await auth.demoAccess(roleSchema.parse(req.params.role)));
  });
  router.post('/login', originGuard, async (req, res) => {
    const now = Date.now();
    for (const [key, entry] of attempts)
      if (entry.expires <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    if (!attempts.has(key) && attempts.size >= 10000)
      throw new ServiceError(
        429,
        'RATE_LIMITED',
        'Please try again in a minute.',
      );
    const entry = attempts.get(key) ?? { count: 0, expires: now + 60000 };
    attempts.set(key, entry);
    if (++entry.count > 10) {
      res.setHeader('Retry-After', Math.ceil((entry.expires - now) / 1000));
      throw new ServiceError(
        429,
        'RATE_LIMITED',
        'Too many login attempts. Try again in a minute.',
      );
    }
    empty.parse(req.query);
    const input = loginSchema.parse(req.body);
    const session = await auth.login(input.email, input.password);
    await auth.logout(req.headers.cookie);
    res.cookie(auth.cookieName, session.token, {
      ...auth.cookieOptions,
      maxAge: auth.maxAge,
    });
    res.json(session.user);
  });
  router.post('/logout', originGuard, async (req, res) => {
    empty.parse(req.query);
    empty.parse(req.body ?? {});
    await auth.logout(req.headers.cookie);
    res.clearCookie(auth.cookieName, auth.cookieOptions);
    res.status(204).end();
  });
  router.get('/me', async (req, res) => {
    empty.parse(req.query);
    res.json((await auth.authenticate(req.headers.cookie)).user);
  });
  router.get(
    '/kitchen/orders',
    requireRole(auth, 'kitchen', 'admin'),
    async (req, res) => {
      empty.parse(req.query);
      res.json(await customer.activeOrders());
    },
  );
  router.patch(
    '/kitchen/orders/:id/status',
    originGuard,
    requireRole(auth, 'kitchen', 'admin'),
    async (req, res) => {
      empty.parse(req.query);
      const id = idSchema.parse(req.params.id);
      const { status } = updateOrderStatusSchema.parse(req.body);
      res.json(await customer.setStatus(id, status));
    },
  );
  // A role-protected entry point only; menu management and reporting are Phase 3B.
  router.get('/admin/access', requireRole(auth, 'admin'), async (req, res) => {
    empty.parse(req.query);
    res.json((await auth.authenticate(req.headers.cookie)).user);
  });
  return router;
}
