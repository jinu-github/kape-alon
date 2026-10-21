import { z } from 'zod';
import { menuItemSchema } from '@kape/shared';

export const cartLineSchema = z.object({
  key: z.string(),
  item: menuItemSchema,
  quantity: z.number().int().min(1).max(20),
  choiceIds: z.array(z.string()),
  notes: z.string().max(500),
});
export type CartLine = z.infer<typeof cartLineSchema>;
export function linePrice(line: CartLine): number {
  return (
    line.item.priceCents +
    line.item.options
      .flatMap((group) => group.choices)
      .filter((choice) => line.choiceIds.includes(choice.id))
      .reduce((sum, choice) => sum + choice.priceCents, 0)
  );
}
export function loadCart(table: number): CartLine[] {
  try {
    const parsed = z
      .array(cartLineSchema)
      .max(30)
      .safeParse(JSON.parse(localStorage.getItem('cart:' + table) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
