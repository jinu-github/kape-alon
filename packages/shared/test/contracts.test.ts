import { describe, expect, it } from 'vitest';
import {
  canTransition,
  createOrderSchema,
  notesSchema,
  optionGroupSchema,
} from '../src/index.ts';

describe('shared contracts', () => {
  it('accepts forward transitions and cancellation, but never reopens terminal orders', () => {
    expect(canTransition('received', 'preparing')).toBe(true);
    expect(canTransition('preparing', 'cancelled')).toBe(true);
    expect(canTransition('received', 'served')).toBe(false);
    expect(canTransition('served', 'received')).toBe(false);
    expect(canTransition('cancelled', 'preparing')).toBe(false);
  });
  it('normalizes notes to bounded plain text', () => {
    expect(notesSchema.parse('  <b>No ice</b>\nplease\u0000 ')).toBe(
      'No ice please',
    );
    expect(notesSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });
  it('rejects client-supplied prices and empty carts', () => {
    expect(
      createOrderSchema.safeParse({ tableNumber: 5, items: [] }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        tableNumber: 5,
        items: [
          {
            menuItemId: '00000000-0000-4000-8000-000000000100',
            quantity: 1,
            priceCents: 1,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects impossible option group limits', () => {
    expect(
      optionGroupSchema.safeParse({
        id: '00000000-0000-4000-8000-000000001000',
        name: 'Size',
        minSelections: 2,
        maxSelections: 1,
        choices: [
          {
            id: '00000000-0000-4000-8000-000000001001',
            name: 'Regular',
            priceCents: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
