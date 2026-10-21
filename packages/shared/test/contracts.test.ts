import { describe, expect, it } from 'vitest';
import {
  canTransition,
  createOrderSchema,
  notesSchema,
  optionGroupSchema,
  orderStatuses,
} from '../src/index.ts';

describe('shared contracts', () => {
  it('checks the entire status transition matrix', () => {
    const legal = new Set([
      'received:preparing',
      'received:cancelled',
      'preparing:ready',
      'preparing:cancelled',
      'ready:served',
      'ready:cancelled',
    ]);
    for (const from of orderStatuses)
      for (const to of orderStatuses)
        expect(canTransition(from, to)).toBe(legal.has(from + ':' + to));
  });
  it('bounds table numbers, cart size, quantities and notes', () => {
    const item = {
      menuItemId: '00000000-0000-4000-8000-000000000100',
      quantity: 1,
    };
    for (const tableNumber of [0, -1, 1000, 1.5])
      expect(
        createOrderSchema.safeParse({ tableNumber, items: [item] }).success,
      ).toBe(false);
    for (const quantity of [0, -1, 21, 1.5])
      expect(
        createOrderSchema.safeParse({
          tableNumber: 5,
          items: [{ ...item, quantity }],
        }).success,
      ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        tableNumber: 5,
        items: Array.from({ length: 31 }, () => item),
      }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        tableNumber: 5,
        items: [{ ...item, notes: 'x'.repeat(501) }],
      }).success,
    ).toBe(false);
  });
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
