import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { orderStatuses } from '@kape/shared';

export const orderStatus = pgEnum('order_status', orderStatuses);
export const userRole = pgEnum('user_role', ['kitchen', 'admin']);

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
});
export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 300 }).notNull(),
    imageUrl: text('image_url').notNull(),
    priceCents: integer('price_cents').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    available: boolean('available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    check('menu_price_nonnegative', sql`${table.priceCents} >= 0`),
    index('menu_category_idx').on(table.categoryId),
  ],
);
export const itemOptions = pgTable(
  'item_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    minSelections: integer('min_selections').notNull().default(0),
    maxSelections: integer('max_selections').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    check(
      'option_selection_limits',
      sql`${table.minSelections} >= 0 AND ${table.maxSelections} >= 1 AND ${table.minSelections} <= ${table.maxSelections}`,
    ),
    index('option_item_idx').on(table.menuItemId),
  ],
);
export const optionChoices = pgTable(
  'option_choices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    optionGroupId: uuid('option_group_id')
      .notNull()
      .references(() => itemOptions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    priceCents: integer('price_cents').notNull().default(0),
  },
  (table) => [
    check('choice_price_nonnegative', sql`${table.priceCents} >= 0`),
    index('choice_group_idx').on(table.optionGroupId),
  ],
);
export const tables = pgTable(
  'tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number').notNull().unique(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check('table_number_positive', sql`${table.number} BETWEEN 1 AND 999`),
  ],
);
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
});
export type OrderChoiceSnapshot = {
  id: string;
  name: string;
  priceCents: number;
};
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'restrict' }),
    tableNumber: integer('table_number').notNull(),
    status: orderStatus('status').notNull().default('received'),
    notes: varchar('notes', { length: 500 }).notNull().default(''),
    totalCents: integer('total_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('order_total_nonnegative', sql`${table.totalCents} >= 0`),
    index('order_status_created_idx').on(table.status, table.createdAt),
    index('order_created_idx').on(table.createdAt),
  ],
);
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 100 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    choices: jsonb('choices')
      .$type<OrderChoiceSnapshot[]>()
      .notNull()
      .default([]),
    notes: varchar('notes', { length: 500 }).notNull().default(''),
  },
  (table) => [
    check(
      'order_item_quantity_positive',
      sql`${table.quantity} BETWEEN 1 AND 20`,
    ),
    check('order_item_price_nonnegative', sql`${table.unitPriceCents} >= 0`),
    index('order_item_order_idx').on(table.orderId),
  ],
);
