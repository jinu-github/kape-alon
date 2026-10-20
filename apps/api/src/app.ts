import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { getHealth } from './services/health.ts';
import type { DatabaseProbe } from './services/health.ts';

export function createApp(options: { probe: DatabaseProbe; webOrigin: string }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Vary', 'Origin');
    if (req.headers.origin === options.webOrigin) {
      res.setHeader('Access-Control-Allow-Origin', options.webOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', async (req, res) => {
    z.strictObject({}).parse(req.query);
    const health = await getHealth(options.probe);
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: {
        code: 'VALIDATION_ERROR',
        message: 'Check the request fields.',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      } });
      return;
    }
    const bodyError = z.object({ type: z.string() }).safeParse(error);
    if (bodyError.success && ['entity.parse.failed', 'entity.too.large'].includes(bodyError.data.type)) {
      const tooLarge = bodyError.data.type === 'entity.too.large';
      res.status(tooLarge ? 413 : 400).json({ error: {
        code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
        message: tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.',
      } });
      return;
    }
    console.error('Unhandled API error', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  };
  app.use(errorHandler);
  return app;
}
