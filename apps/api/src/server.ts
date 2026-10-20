import { createApp } from './app.ts';
import { pool } from './db/client.ts';
import { env } from './env.ts';

pool.on('error', (error) =>
  console.error('Idle database connection failed', error.message),
);
const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  probe: async () => {
    await pool.query('SELECT 1');
  },
});
const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void pool.end();
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
