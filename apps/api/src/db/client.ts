import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env.ts';
import * as schema from './schema.ts';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
// Hosted PostgreSQL TLS is configured in DATABASE_URL; never disable verification.
export const db = drizzle(pool, { schema });
