import { Router } from 'express';
import { z } from 'zod';
import {
  adminItemInputSchema,
  categoryInputSchema,
  historyFilterSchema,
  idSchema,
  resetSchema,
} from '@kape/shared';
import { requireRole, requireStaffOrigin } from '../middleware/auth.ts';
import type { AuthService } from '../services/auth.ts';
import type { AdminService } from '../services/admin.ts';
import type { CustomerService } from '../services/customer.ts';
export function adminRouter(
  auth: AuthService,
  admin: AdminService,
  customer: CustomerService,
  origin: string,
) {
  const router = Router();
  const empty = z.strictObject({});
  router.use(requireRole(auth, 'admin'));
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return requireStaffOrigin(origin)(req, res, next);
    next();
  });
  router.get('/menu', async (req, res) => {
    empty.parse(req.query);
    res.json(await customer.menu());
  });
  router.get('/settings', async (req, res) => {
    empty.parse(req.query);
    res.json(await admin.settings());
  });
  router.get('/dashboard', async (req, res) => {
    empty.parse(req.query);
    res.json(await admin.dashboard());
  });
  router.get('/orders', async (req, res) => {
    res.json(await admin.history(historyFilterSchema.parse(req.query)));
  });
  router.get('/orders/:id', async (req, res) => {
    empty.parse(req.query);
    res.json(await customer.order(idSchema.parse(req.params.id)));
  });
  router.post('/categories', async (req, res) => {
    empty.parse(req.query);
    res
      .status(201)
      .json(
        await admin.category(undefined, categoryInputSchema.parse(req.body)),
      );
  });
  router.put('/categories/:id', async (req, res) => {
    empty.parse(req.query);
    res.json(
      await admin.category(
        idSchema.parse(req.params.id),
        categoryInputSchema.parse(req.body),
      ),
    );
  });
  router.delete('/categories/:id', async (req, res) => {
    empty.parse(req.query);
    await admin.deleteCategory(idSchema.parse(req.params.id));
    res.status(204).end();
  });
  router.post('/items', async (req, res) => {
    empty.parse(req.query);
    res
      .status(201)
      .json(await admin.item(undefined, adminItemInputSchema.parse(req.body)));
  });
  router.put('/items/:id', async (req, res) => {
    empty.parse(req.query);
    res.json(
      await admin.item(
        idSchema.parse(req.params.id),
        adminItemInputSchema.parse(req.body),
      ),
    );
  });
  router.delete('/items/:id', async (req, res) => {
    empty.parse(req.query);
    await admin.deleteItem(idSchema.parse(req.params.id));
    res.status(204).end();
  });
  router.post('/reset', async (req, res) => {
    empty.parse(req.query);
    resetSchema.parse(req.body);
    await admin.reset();
    res.clearCookie(auth.cookieName, auth.cookieOptions);
    res.status(204).end();
  });
  return router;
}
