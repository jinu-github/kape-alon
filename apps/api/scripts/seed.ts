import { db, pool } from '../src/db/client.ts';
import { seedDatabase } from '../src/services/seed.ts';
try {
  const result = await seedDatabase(
    db,
    process.env.DEMO_PASSWORD ?? '',
    process.env.ALLOW_DEMO_RESET === 'true',
  );
  console.log('Seed complete:', result);
} finally {
  await pool.end();
}
