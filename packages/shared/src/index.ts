import { z } from 'zod';
export { cafeConfig, formatMoney } from './config.ts';

export const orderStatuses = [
  'received',
  'preparing',
  'ready',
  'served',
  'cancelled',
] as const;
export const orderStatusSchema = z.enum(orderStatuses);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export const roleSchema = z.enum(['kitchen', 'admin']);
export const staffUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: roleSchema,
});
export type StaffUser = z.infer<typeof staffUserSchema>;
export const demoAccessSchema = z.object({
  email: z.email(),
  password: z.string(),
});
export const idSchema = z.uuid();
export const moneySchema = z.number().int().min(0).max(10_000_000);
export const tableNumberSchema = z.number().int().min(1).max(999);
export const dietaryTagSchema = z.enum([
  'vegetarian',
  'vegan',
  'spicy',
  'gluten-free',
  'contains-nuts',
]);

// Plain text only. Render as text, never innerHTML; this is not an HTML sanitizer.
export const notesSchema = z
  .string()
  .max(500)
  .transform((value) =>
    value
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim(),
  )
  .default('');

export const categoryInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).default(0),
});
export const optionChoiceSchema = z.strictObject({
  available: z.boolean().default(true),
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  priceCents: moneySchema,
});
export const optionGroupSchema = z
  .strictObject({
    available: z.boolean().default(true),
    id: idSchema,
    name: z.string().trim().min(1).max(80),
    minSelections: z.number().int().min(0).max(10),
    maxSelections: z.number().int().min(1).max(10),
    choices: z.array(optionChoiceSchema).min(1).max(20),
  })
  .superRefine((group, ctx) => {
    if (
      group.minSelections > group.maxSelections ||
      group.maxSelections > group.choices.length
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid selection limits' });
    if (
      new Set(group.choices.map((choice) => choice.id)).size !==
      group.choices.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate choice IDs' });
  });
export const menuItemInputSchema = z.strictObject({
  categoryId: idSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  imageUrl: z
    .url()
    .refine((value) => value.startsWith('https://'), 'Use HTTPS'),
  priceCents: moneySchema,
  tags: z.array(dietaryTagSchema).max(5).default([]),
  available: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});
export const menuItemSchema = menuItemInputSchema.extend({
  id: idSchema,
  options: z.array(optionGroupSchema),
});
export type MenuItem = z.infer<typeof menuItemSchema>;
export type OptionGroup = z.infer<typeof optionGroupSchema>;

export const createOrderSchema = z.strictObject({
  tableNumber: tableNumberSchema,
  items: z
    .array(
      z.strictObject({
        menuItemId: idSchema,
        quantity: z.number().int().min(1).max(20),
        choiceIds: z.array(idSchema).max(30).default([]),
        notes: notesSchema,
      }),
    )
    .min(1)
    .max(30),
  notes: notesSchema,
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export const updateOrderStatusSchema = z.strictObject({
  status: orderStatusSchema,
});
export const loginSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(72),
});

export const allowedTransitions: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  received: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: [],
  cancelled: [],
};
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('api'),
  database: z.enum(['up', 'down']),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const menuResponseSchema = z.object({
  categories: z.array(categoryInputSchema.extend({ id: idSchema })),
  items: z.array(menuItemSchema),
});
export const tableResponseSchema = z.object({
  number: tableNumberSchema,
  active: z.literal(true),
});
export const orderResponseSchema = z.object({
  id: idSchema,
  tableNumber: tableNumberSchema,
  status: orderStatusSchema,
  notes: z.string(),
  totalCents: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  items: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      notes: z.string(),
      choices: z.array(
        z.object({ id: idSchema, name: z.string(), priceCents: moneySchema }),
      ),
    }),
  ),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const adminItemInputSchema = menuItemInputSchema
  .extend({ options: z.array(optionGroupSchema).max(10) })
  .superRefine((item, ctx) => {
    const ids = item.options.flatMap((group) => [
      group.id,
      ...group.choices.map((choice) => choice.id),
    ]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Option and choice IDs must be unique.',
      });
  });
export type AdminItemInput = z.infer<typeof adminItemInputSchema>;
export const adminCategorySchema = categoryInputSchema.extend({ id: z.uuid() });
export const historyFilterSchema = z
  .strictObject({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: orderStatusSchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to)
      ctx.addIssue({
        code: 'custom',
        message: 'Start date must not be after end date.',
      });
  });
export type HistoryFilter = z.infer<typeof historyFilterSchema>;
export const historyResponseSchema = z.object({
  orders: z.array(orderResponseSchema.omit({ items: true })),
  hasMore: z.boolean(),
});
export const dashboardSchema = z.object({
  date: z.iso.date(),
  timezone: z.string(),
  ordersToday: z.number().int().nonnegative(),
  revenueTodayCents: z.number().nonnegative(),
  topItems: z.array(
    z.object({ name: z.string(), quantity: z.number().int().nonnegative() }),
  ),
  hours: z.array(
    z.object({
      hour: z.number().int().min(0).max(23),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export const adminSettingsSchema = z.object({
  resetEnabled: z.boolean(),
  customerBaseUrl: z.url(),
  tables: z.array(z.number().int()),
});
export const resetSchema = z.strictObject({
  confirmation: z.literal('RESET DEMO DATA'),
});
