import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  cafeConfig,
  dashboardSchema,
  historyResponseSchema,
} from '@kape/shared';
import type { AdminItemInput, HistoryFilter } from '@kape/shared';
import type { z } from 'zod';
import type { categoryInputSchema } from '@kape/shared';
import type { db } from '../db/client.ts';
import * as s from '../db/schema.ts';
import type { CustomerService } from './customer.ts';
import { ServiceError } from './errors.ts';
import { cafeDate, dateConditions } from './reporting.ts';

export function createAdminService(
  database: typeof db,
  customer: CustomerService,
  config: {
    resetEnabled: boolean;
    customerBaseUrl: string;
    reset: () => Promise<void>;
  },
) {
  let resetAfter = 0;
  let resetting = false;
  async function category(
    id: string | undefined,
    input: z.infer<typeof categoryInputSchema>,
  ) {
    const rows = id
      ? await database
          .update(s.categories)
          .set(input)
          .where(eq(s.categories.id, id))
          .returning()
      : await database.insert(s.categories).values(input).returning();
    if (!rows[0])
      throw new ServiceError(404, 'NOT_FOUND', 'Category not found.');
    customer.events.emit('menu');
    return rows[0];
  }
  async function deleteCategory(id: string) {
    const rows = await database
      .delete(s.categories)
      .where(eq(s.categories.id, id))
      .returning();
    if (!rows.length)
      throw new ServiceError(404, 'NOT_FOUND', 'Category not found.');
    customer.events.emit('menu');
  }
  async function item(id: string | undefined, input: AdminItemInput) {
    const itemId = await database.transaction(async (tx) => {
      // Same lock order as order creation; catalog writes cannot race server pricing.
      await tx.execute(
        sql.raw(
          'LOCK TABLE menu_items, item_options, option_choices, tables IN SHARE ROW EXCLUSIVE MODE',
        ),
      );
      const { options, ...fields } = input;
      const rows = id
        ? await tx
            .update(s.menuItems)
            .set(fields)
            .where(eq(s.menuItems.id, id))
            .returning()
        : await tx.insert(s.menuItems).values(fields).returning();
      const record = rows[0];
      if (!record) throw new ServiceError(404, 'NOT_FOUND', 'Item not found.');
      await tx
        .delete(s.itemOptions)
        .where(eq(s.itemOptions.menuItemId, record.id));
      for (const [sortOrder, group] of options.entries()) {
        const { choices, ...fields } = group;
        await tx
          .insert(s.itemOptions)
          .values({ ...fields, menuItemId: record.id, sortOrder });
        await tx
          .insert(s.optionChoices)
          .values(
            choices.map((choice) => ({ ...choice, optionGroupId: group.id })),
          );
      }
      return record.id;
    });
    customer.events.emit('menu');
    return { id: itemId };
  }
  async function deleteItem(id: string) {
    await database.transaction(async (tx) => {
      await tx.execute(
        sql.raw(
          'LOCK TABLE menu_items, item_options, option_choices, tables IN SHARE ROW EXCLUSIVE MODE',
        ),
      );
      const rows = await tx
        .delete(s.menuItems)
        .where(eq(s.menuItems.id, id))
        .returning();
      if (!rows.length)
        throw new ServiceError(404, 'NOT_FOUND', 'Item not found.');
    });
    customer.events.emit('menu');
  }
  async function history(filter: HistoryFilter) {
    const conditions = dateConditions(filter.from, filter.to);
    if (filter.status) conditions.push(eq(s.orders.status, filter.status));
    const rows = await database
      .select()
      .from(s.orders)
      .where(and(...conditions))
      .orderBy(desc(s.orders.createdAt), desc(s.orders.id))
      .limit(51)
      .offset((filter.page - 1) * 50);
    return historyResponseSchema.parse({
      orders: rows
        .slice(0, 50)
        .map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      hasMore: rows.length > 50,
    });
  }
  async function dashboard(now = new Date()) {
    const date = cafeDate(now);
    const day = and(...dateConditions(date, date));
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`,
      );
      const [totals] = await tx
        .select({
          ordersToday: sql<number>`count(*)`.mapWith(Number),
          revenueTodayCents:
            sql<number>`coalesce(sum(case when ${s.orders.status} = 'served' then ${s.orders.totalCents} else 0 end),0)`.mapWith(
              Number,
            ),
        })
        .from(s.orders)
        .where(day);
      const topItems = await tx
        .select({
          name: s.orderItems.name,
          quantity: sql<number>`sum(${s.orderItems.quantity})`.mapWith(Number),
        })
        .from(s.orderItems)
        .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
        .where(and(day, eq(s.orders.status, 'served')))
        .groupBy(s.orderItems.name)
        .orderBy(
          desc(sql`sum(${s.orderItems.quantity})`),
          asc(s.orderItems.name),
        )
        .limit(5);
      const hour =
        sql<number>`extract(hour from ${s.orders.createdAt} AT TIME ZONE ${cafeConfig.timezone})`.mapWith(
          Number,
        );
      const counts = await tx
        .select({ hour, count: sql<number>`count(*)`.mapWith(Number) })
        .from(s.orders)
        .where(day)
        .groupBy(sql`1`);
      return dashboardSchema.parse({
        date,
        timezone: cafeConfig.timezone,
        ...totals,
        topItems,
        hours: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: counts.find((row) => row.hour === hour)?.count ?? 0,
        })),
      });
    });
  }
  async function settings() {
    const tables = await database
      .select({ number: s.tables.number })
      .from(s.tables)
      .where(eq(s.tables.active, true))
      .orderBy(asc(s.tables.number));
    return {
      resetEnabled: config.resetEnabled,
      customerBaseUrl: config.customerBaseUrl,
      tables: tables.map((table) => table.number),
    };
  }
  async function reset() {
    if (!config.resetEnabled)
      throw new ServiceError(403, 'RESET_DISABLED', 'Demo reset is disabled.');
    if (resetting || Date.now() < resetAfter)
      throw new ServiceError(
        429,
        'RATE_LIMITED',
        'A reset is already running or was attempted recently. Wait five minutes.',
      );
    resetting = true;
    resetAfter = Date.now() + 300000;
    try {
      await config.reset();
      customer.events.emit('reset');
      customer.events.emit('menu');
    } finally {
      resetting = false;
    }
  }
  return {
    category,
    deleteCategory,
    item,
    deleteItem,
    history,
    dashboard,
    settings,
    reset,
  };
}
export type AdminService = ReturnType<typeof createAdminService>;
