import { readFile } from 'node:fs/promises';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { seedDataSchema } from '../seed/schema.ts';
import { db, pool } from '../src/db/client.ts';
import * as schema from '../src/db/schema.ts';
import { priceOrderItems, calculateTotal } from '../src/services/pricing.ts';

try {
  if (process.env.ALLOW_DEMO_RESET !== 'true')
    throw new Error(
      'Refusing to wipe data. Set ALLOW_DEMO_RESET=true only for a demo database.',
    );
  const password = z.string().min(8).max(72).parse(process.env.DEMO_PASSWORD);
  const seed = seedDataSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../seed/seed-data.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const passwordHash = await bcrypt.hash(password, 12);
  const now = Date.now();
  // All validation/pricing happens before destructive work; rollback protects the old dataset.
  const pricedOrders = seed.orders.map((order) => {
    const items = priceOrderItems(order.items, seed.menuItems);
    const table = seed.tables.find(
      (table) => table.number === order.tableNumber,
    );
    if (!table) throw new Error('Unknown seed table');
    return { order, items, table, totalCents: calculateTotal(items) };
  });
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE order_items, orders, option_choices, item_options, menu_items, categories, tables, users`,
    );
    await tx.insert(schema.categories).values(seed.categories);
    await tx.insert(schema.tables).values(seed.tables);
    await tx
      .insert(schema.users)
      .values(seed.users.map((user) => ({ ...user, passwordHash })));
    await tx
      .insert(schema.menuItems)
      .values(seed.menuItems.map(({ options: _options, ...item }) => item));
    for (const item of seed.menuItems) {
      for (const [sortOrder, group] of item.options.entries()) {
        const { choices, ...fields } = group;
        await tx
          .insert(schema.itemOptions)
          .values({ ...fields, menuItemId: item.id, sortOrder });
        await tx
          .insert(schema.optionChoices)
          .values(
            choices.map((choice) => ({ ...choice, optionGroupId: group.id })),
          );
      }
    }
    for (const { order, table, items, totalCents } of pricedOrders) {
      const createdAt = new Date(now - order.minutesAgo * 60000);
      await tx.insert(schema.orders).values({
        id: order.id,
        tableId: table.id,
        tableNumber: table.number,
        status: order.status,
        notes: order.notes,
        totalCents,
        createdAt,
        updatedAt: createdAt,
      });
      await tx
        .insert(schema.orderItems)
        .values(items.map((item) => ({ ...item, orderId: order.id })));
    }
  });
  console.log(
    `Seed complete: ${seed.menuItems.length} items, ${seed.tables.length} tables, ${seed.orders.length} sample orders.`,
  );
} finally {
  await pool.end();
}
