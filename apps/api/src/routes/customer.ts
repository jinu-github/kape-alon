import { Router } from 'express';
import { z } from 'zod';
import { createOrderSchema, idSchema, tableNumberSchema } from '@kape/shared';
import type { CustomerService } from '../services/customer.ts';
import { ServiceError } from '../services/errors.ts';

export function customerRouter(service: CustomerService) {
  const router = Router();
  const attempts = new Map<string, { count: number; expires: number }>();
  router.get('/menu', async (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(await service.menu());
  });
  router.get('/tables/:number', async (req, res) => {
    z.strictObject({}).parse(req.query);
    const { number } = z
      .object({
        number: z
          .string()
          .regex(/^[1-9]\d{0,2}$/)
          .transform(Number)
          .pipe(tableNumberSchema),
      })
      .parse(req.params);
    const table = await service.table(number);
    res.json({ number: table.number, active: table.active });
  });
  router.post('/orders', async (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.expires <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    const bucket = attempts.get(key) ?? { count: 0, expires: now + 60000 };
    bucket.count += 1;
    attempts.set(key, bucket);
    if (bucket.count > 10) {
      res.setHeader('Retry-After', Math.ceil((bucket.expires - now) / 1000));
      throw new ServiceError(
        429,
        'RATE_LIMITED',
        'Too many orders. Please wait a minute and try again.',
      );
    }
    z.strictObject({}).parse(req.query);
    const input = createOrderSchema.parse(req.body);
    res.status(201).json(await service.create(input));
  });
  router.get('/orders/:id', async (req, res) => {
    z.strictObject({}).parse(req.query);
    const { id } = z.object({ id: idSchema }).parse(req.params);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await service.order(id));
  });
  return router;
}
