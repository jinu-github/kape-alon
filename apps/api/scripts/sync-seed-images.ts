import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client.ts';
import { menuItems } from '../src/db/schema.ts';
import { seedDataSchema } from '../seed/schema.ts';

try {
  const seed = seedDataSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../seed/seed-data.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  await db.transaction(async (tx) => {
    for (const item of seed.menuItems)
      await tx
        .update(menuItems)
        .set({ imageUrl: item.imageUrl })
        .where(eq(menuItems.id, item.id));
  });
  console.log(
    'Updated only seed item image URLs; orders and availability preserved.',
  );
} finally {
  await pool.end();
}
