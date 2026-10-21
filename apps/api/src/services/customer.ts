import { EventEmitter } from 'node:events';
import { asc, eq, sql } from 'drizzle-orm';
import {
  canTransition,
  menuResponseSchema,
  orderResponseSchema,
} from '@kape/shared';
import type { CreateOrderInput, OrderStatus } from '@kape/shared';
import type { db } from '../db/client.ts';
import * as s from '../db/schema.ts';
import { priceOrderItems, calculateTotal } from './pricing.ts';
import { ServiceError } from './errors.ts';

type Database = typeof db;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export function createCustomerService(database: Database) {
  const events = new EventEmitter();
  async function menu(source: Database | Transaction = database) {
    const categories = await source
      .select()
      .from(s.categories)
      .orderBy(asc(s.categories.sortOrder));
    const items = await source
      .select()
      .from(s.menuItems)
      .orderBy(asc(s.menuItems.sortOrder), asc(s.menuItems.name));
    const groups = await source
      .select()
      .from(s.itemOptions)
      .orderBy(asc(s.itemOptions.sortOrder));
    const choices = await source
      .select()
      .from(s.optionChoices)
      .orderBy(asc(s.optionChoices.id));
    return menuResponseSchema.parse({
      categories,
      items: items.map((item) => ({
        ...item,
        options: groups
          .filter((group) => group.menuItemId === item.id)
          .map((group) => ({
            id: group.id,
            name: group.name,
            available: group.available,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            choices: choices
              .filter((choice) => choice.optionGroupId === group.id)
              .map(({ optionGroupId: _group, ...choice }) => choice),
          })),
      })),
    });
  }
  async function table(
    number: number,
    source: Database | Transaction = database,
  ) {
    const [record] = await source
      .select()
      .from(s.tables)
      .where(eq(s.tables.number, number));
    if (!record || !record.active)
      throw new ServiceError(
        404,
        'TABLE_UNAVAILABLE',
        'This table is unavailable. Please ask the cafe team for help.',
      );
    return record;
  }
  async function order(id: string, source: Database | Transaction = database) {
    const [record] = await source
      .select()
      .from(s.orders)
      .where(eq(s.orders.id, id));
    if (!record)
      throw new ServiceError(
        404,
        'ORDER_NOT_FOUND',
        'This order could not be found.',
      );
    const items = await source
      .select()
      .from(s.orderItems)
      .where(eq(s.orderItems.orderId, id))
      .orderBy(asc(s.orderItems.id));
    return orderResponseSchema.parse({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      items,
    });
  }
  async function create(input: CreateOrderInput) {
    return database.transaction(async (tx) => {
      // Shared locks allow concurrent orders but prevent catalog changes while pricing.
      await tx.execute(
        sql.raw(
          'LOCK TABLE menu_items, item_options, option_choices, tables IN SHARE MODE',
        ),
      );
      const selectedTable = await table(input.tableNumber, tx);
      const catalog = await menu(tx);
      let items;
      try {
        items = priceOrderItems(input.items, catalog.items);
      } catch (error) {
        throw new ServiceError(
          409,
          'MENU_CHANGED',
          error instanceof Error ? error.message : 'Please review your order.',
        );
      }
      const totalCents = calculateTotal(items);
      const [created] = await tx
        .insert(s.orders)
        .values({
          tableId: selectedTable.id,
          tableNumber: selectedTable.number,
          notes: input.notes,
          totalCents,
        })
        .returning();
      if (!created) throw new Error('Order insert returned no record');
      await tx
        .insert(s.orderItems)
        .values(items.map((item) => ({ ...item, orderId: created.id })));
      return order(created.id, tx);
    });
  }
  // Phase 3 will call this service from authenticated kitchen routes.
  async function setStatus(id: string, status: OrderStatus) {
    const updated = await database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(s.orders)
        .where(eq(s.orders.id, id))
        .for('update');
      if (!current)
        throw new ServiceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (!canTransition(current.status, status))
        throw new ServiceError(
          409,
          'INVALID_TRANSITION',
          'This status change is not allowed.',
        );
      await tx
        .update(s.orders)
        .set({ status, updatedAt: new Date() })
        .where(eq(s.orders.id, id));
      return order(id, tx);
    });
    events.emit('updated', updated);
    return updated;
  }
  return { menu, table, order, create, setStatus, events };
}
export type CustomerService = ReturnType<typeof createCustomerService>;
