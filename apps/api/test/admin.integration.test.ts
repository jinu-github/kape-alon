import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createAdminService } from '../src/services/admin.ts';
import { createCustomerService } from '../src/services/customer.ts';
import type { db as Database, pool as Pool } from '../src/db/client.ts';
import type { AdminService } from '../src/services/admin.ts';
import * as s from '../src/db/schema.ts';
describe.skipIf(process.env.INTEGRATION_TESTS !== '1')(
  'admin persistence and dashboard',
  () => {
    let db: typeof Database;
    let pool: typeof Pool;
    let admin: AdminService;
    const categoryId = randomUUID();
    const orderIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    let itemId: string | undefined;
    beforeAll(async () => {
      ({ db, pool } = await import('../src/db/client.ts'));
      admin = createAdminService(db, createCustomerService(db), {
        resetEnabled: false,
        customerBaseUrl: 'http://localhost:5173',
        reset: async () => {
          throw new Error('Reset must not run');
        },
      });
      await db
        .insert(s.categories)
        .values({ id: categoryId, name: 'Test ' + categoryId });
    }, 30000);
    afterAll(async () => {
      if (db) {
        await db.delete(s.orders).where(inArray(s.orders.id, orderIds));
        if (itemId)
          await db.delete(s.menuItems).where(eq(s.menuItems.id, itemId));
        await db.delete(s.categories).where(eq(s.categories.id, categoryId));
      }
      await pool?.end();
    }, 30000);
    it('CRUD preserves receipts and reports use served revenue and local-day boundaries', async () => {
      const input = {
        categoryId,
        name: 'Test meal',
        description: 'Test only',
        imageUrl: 'https://example.com/meal.png',
        priceCents: 10000,
        tags: [],
        available: true,
        sortOrder: 0,
        options: [
          {
            id: randomUUID(),
            name: 'Size',
            minSelections: 1,
            maxSelections: 1,
            available: true,
            choices: [
              {
                id: randomUUID(),
                name: 'Regular',
                priceCents: 500,
                available: true,
              },
            ],
          },
        ],
      };
      itemId = (await admin.item(undefined, input)).id;
      await admin.category(categoryId, {
        name: 'Renamed ' + categoryId,
        sortOrder: 3,
      });
      await admin.item(itemId, {
        ...input,
        priceCents: 11000,
        available: false,
      });
      expect(
        (await createCustomerService(db).menu()).items.find(
          (item) => item.id === itemId,
        ),
      ).toMatchObject({
        priceCents: 11000,
        available: false,
        options: [{ name: 'Size' }],
      });
      await expect(admin.deleteCategory(categoryId)).rejects.toThrow();
      const [table] = await db.select().from(s.tables).limit(1);
      if (!table) throw new Error('Seed tables required');
      for (const [index, status] of (
        ['served', 'received', 'cancelled', 'served'] as const
      ).entries()) {
        const id = orderIds[index]!;
        await db
          .insert(s.orders)
          .values({
            id,
            tableId: table.id,
            tableNumber: table.number,
            status,
            totalCents: 10500,
            createdAt: new Date(
              index === 3 ? '2001-01-02T16:00:00Z' : '2001-01-01T16:00:00Z',
            ),
          });
        await db
          .insert(s.orderItems)
          .values({
            orderId: id,
            menuItemId: itemId,
            name: 'Test snapshot',
            quantity: 2,
            unitPriceCents: 5250,
          });
      }
      const report = await admin.dashboard(new Date('2001-01-02T04:00:00Z'));
      expect(report.ordersToday).toBe(3);
      expect(report.revenueTodayCents).toBe(10500);
      expect(report.topItems).toEqual([{ name: 'Test snapshot', quantity: 2 }]);
      expect(report.hours[0]?.count).toBe(3);
      expect(
        (
          await admin.history({
            from: '2001-01-02',
            to: '2001-01-02',
            status: 'served',
            page: 1,
          })
        ).orders,
      ).toHaveLength(1);
      await admin.deleteItem(itemId);
      itemId = undefined;
      const [receipt] = await db
        .select()
        .from(s.orderItems)
        .where(eq(s.orderItems.orderId, orderIds[0]!));
      expect(receipt).toMatchObject({
        name: 'Test snapshot',
        menuItemId: null,
      });
      await admin.deleteCategory(categoryId);
    }, 30000);
    it('returns an empty day with all 24 hours', async () => {
      const result = await admin.dashboard(new Date('1999-01-01T12:00:00Z'));
      expect(result.ordersToday).toBe(0);
      expect(result.revenueTodayCents).toBe(0);
      expect(result.topItems).toEqual([]);
      expect(result.hours).toHaveLength(24);
      expect(result.hours.every((hour) => hour.count === 0)).toBe(true);
    });
  },
);
