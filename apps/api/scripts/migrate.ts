import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { db, pool } from '../src/db/client.ts';

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)) });
  console.log('Database migrations applied.');
} finally {
  await pool.end();
}
