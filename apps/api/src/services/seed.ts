import { readFile } from 'node:fs/promises';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { seedDataSchema } from './seed-schema.ts';
import type { db } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { priceOrderItems, calculateTotal } from './pricing.ts';

export async function seedDatabase(
  database: typeof db,
  passwordValue: string,
  allowed: boolean,
) {
  if (!allowed)
    throw new Error(
      'Refusing to wipe data. Set ALLOW_DEMO_RESET=true only for a demo database.',
    );
  const password = z.string().min(8).max(72).parse(passwordValue);
  const seed = seedDataSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../../seed/seed-data.json', import.meta.url),
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
  await database.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE auth_sessions, order_items, orders, option_choices, item_options, menu_items, categories, tables, users`,
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
  return {
    items: seed.menuItems.length,
    tables: seed.tables.length,
    orders: seed.orders.length,
  };
}
