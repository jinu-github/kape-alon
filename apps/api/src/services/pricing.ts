import type { CreateOrderInput, MenuItem } from '@kape/shared';

/** Catalog must come from the database on order creation, never from a request. */
export function priceOrderItems(
  items: CreateOrderInput['items'],
  catalog: readonly MenuItem[],
) {
  return items.map((input) => {
    const item = catalog.find((candidate) => candidate.id === input.menuItemId);
    if (!item || !item.available) throw new Error('Item is unavailable.');
    const selectedIds = new Set(input.choiceIds);
    if (selectedIds.size !== input.choiceIds.length)
      throw new Error('Duplicate option choices.');
    const choices = item.options.flatMap((group) => {
      const selected = group.choices.filter((choice) =>
        selectedIds.has(choice.id),
      );
      if (
        selected.length < group.minSelections ||
        selected.length > group.maxSelections
      )
        throw new Error(`Check selections for ${group.name}.`);
      return selected;
    });
    if (choices.length !== selectedIds.size)
      throw new Error('Unknown option choice.');
    const unitPriceCents =
      item.priceCents +
      choices.reduce((sum, choice) => sum + choice.priceCents, 0);
    return {
      menuItemId: item.id,
      name: item.name,
      quantity: input.quantity,
      unitPriceCents,
      choices,
      notes: input.notes,
    };
  });
}

export function calculateTotal(
  items: readonly { unitPriceCents: number; quantity: number }[],
) {
  const total = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  if (!Number.isSafeInteger(total) || total < 0 || total > 2_147_483_647)
    throw new Error('Order total exceeds the supported range.');
  return total;
}
