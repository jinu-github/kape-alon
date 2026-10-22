import express from 'express';
import { adminRouter } from './routes/admin.ts';
import type { AdminService } from './services/admin.ts';
import type { AuthService } from './services/auth.ts';
import { staffRouter } from './routes/staff.ts';
import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { getHealth } from './services/health.ts';
import type { DatabaseProbe } from './services/health.ts';
import { customerRouter } from './routes/customer.ts';
import type { CustomerService } from './services/customer.ts';
import { ServiceError } from './services/errors.ts';

export function createApp(options: {
  probe: DatabaseProbe;
  webOrigin: string;
  customer?: CustomerService;
  auth?: AuthService;
  admin?: AdminService;
  trustProxyHops?: number;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyHops ?? 0);
  app.use((req, res, next) => {
    res.setHeader('Vary', 'Origin');
    if (req.headers.origin === options.webOrigin) {
      res.setHeader('Access-Control-Allow-Origin', options.webOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      );
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use((req, _res, next) => {
    if (
      ['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== options.webOrigin
    )
      throw new ServiceError(
        403,
        'ORIGIN_DENIED',
        'This request origin is not allowed.',
      );
    next();
  });
  app.get('/health', async (req, res) => {
    z.strictObject({}).parse(req.query);
    const health = await getHealth(options.probe);
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });
  if (options.auth && options.customer)
    app.use(staffRouter(options.auth, options.customer, options.webOrigin));
  if (options.auth && options.admin && options.customer)
    app.use(
      '/admin',
      adminRouter(
        options.auth,
        options.admin,
        options.customer,
        options.webOrigin,
      ),
    );
  if (options.customer) app.use(customerRouter(options.customer));
  app.use((_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
  });
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    if (error instanceof ServiceError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the request fields.',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    const constraint = z
      .object({ code: z.string() })
      .safeParse(
        error instanceof Error && 'cause' in error ? error.cause : error,
      );
    if (
      constraint.success &&
      ['23503', '23505'].includes(constraint.data.code)
    ) {
      res
        .status(409)
        .json({
          error: {
            code: 'CATALOG_CONFLICT',
            message:
              constraint.data.code === '23503'
                ? 'This record is in use or its category no longer exists. Move items before deleting a category.'
                : 'That name or option ID already exists. Refresh and try again.',
          },
        });
      return;
    }
    const bodyError = z.object({ type: z.string() }).safeParse(error);
    if (
      bodyError.success &&
      ['entity.parse.failed', 'entity.too.large'].includes(bodyError.data.type)
    ) {
      const tooLarge = bodyError.data.type === 'entity.too.large';
      res.status(tooLarge ? 413 : 400).json({
        error: {
          code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
          message: tooLarge
            ? 'Request body is too large.'
            : 'Request body must be valid JSON.',
        },
      });
      return;
    }
    console.error('Unhandled API error', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    });
  };
  app.use(errorHandler);
  return app;
}
