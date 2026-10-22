import { z } from 'zod';
import {
  categoryInputSchema,
  menuItemInputSchema,
  optionGroupSchema,
  createOrderSchema,
  idSchema,
  orderStatusSchema,
  roleSchema,
  tableNumberSchema,
} from '@kape/shared';

export const seedDataSchema = z
  .strictObject({
    categories: z.array(categoryInputSchema.extend({ id: idSchema })).length(5),
    menuItems: z
      .array(
        menuItemInputSchema.extend({
          id: idSchema,
          options: z.array(optionGroupSchema),
        }),
      )
      .min(20)
      .max(25),
    tables: z
      .array(
        z.strictObject({
          id: idSchema,
          number: tableNumberSchema,
          active: z.boolean(),
        }),
      )
      .length(10),
    users: z
      .array(
        z.strictObject({ id: idSchema, email: z.email(), role: roleSchema }),
      )
      .min(2),
    orders: z.array(
      createOrderSchema.extend({
        id: idSchema,
        status: orderStatusSchema,
        minutesAgo: z.number().int().min(0),
      }),
    ),
  })
  .superRefine((seed, ctx) => {
    const categoryIds = new Set(seed.categories.map((category) => category.id));
    const itemIds = new Set(seed.menuItems.map((item) => item.id));
    const tableNumbers = new Set(seed.tables.map((table) => table.number));
    const ids = [
      ...seed.categories,
      ...seed.menuItems,
      ...seed.tables,
      ...seed.users,
      ...seed.orders,
      ...seed.menuItems.flatMap((item) =>
        item.options.flatMap((group) => [group, ...group.choices]),
      ),
    ].map((record) => record.id);
    if (ids.length !== new Set(ids).size)
      ctx.addIssue({ code: 'custom', message: 'Seed IDs must be unique' });
    if (tableNumbers.size !== seed.tables.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate table numbers' });
    for (const item of seed.menuItems) {
      if (!categoryIds.has(item.categoryId))
        ctx.addIssue({
          code: 'custom',
          message: `Unknown category for ${item.name}`,
        });
    }
    for (const order of seed.orders) {
      if (
        !tableNumbers.has(order.tableNumber) ||
        order.items.some((item) => !itemIds.has(item.menuItemId))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Order has an unknown table or item',
        });
    }
  });
