import { createAuthService, databaseAuthStore } from './services/auth.ts';
import { createAdminService } from './services/admin.ts';
import { seedDatabase } from './services/seed.ts';
import { createApp } from './app.ts';
import { db, pool } from './db/client.ts';
import { env } from './env.ts';
import { createServer } from 'node:http';
import { createCustomerService } from './services/customer.ts';
import { attachRealtime } from './realtime.ts';

pool.on('error', (error) =>
  console.error('Idle database connection failed', error.message),
);
const customer = createCustomerService(db);
const auth = createAuthService(databaseAuthStore(db), {
  secret: env.JWT_SECRET,
  production: env.NODE_ENV === 'production',
  demoMode: env.DEMO_MODE,
  ...(env.DEMO_PASSWORD ? { demoPassword: env.DEMO_PASSWORD } : {}),
});
const admin = createAdminService(db, customer, {
  resetEnabled: env.ALLOW_DEMO_RESET,
  customerBaseUrl: env.CUSTOMER_BASE_URL ?? env.WEB_ORIGIN,
  reset: async () => {
    await seedDatabase(db, env.DEMO_PASSWORD ?? '', env.ALLOW_DEMO_RESET);
  },
});
const app = createApp({
  admin,
  customer,
  auth,
  trustProxyHops: env.TRUST_PROXY_HOPS,
  webOrigin: env.WEB_ORIGIN,
  probe: async () => {
    await pool.query('SELECT 1');
  },
});
const server = createServer(app);
const io = attachRealtime(server, customer, env.WEB_ORIGIN, auth);
server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    io.close();
    server.close(() => {
      void pool.end();
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
