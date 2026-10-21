import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seedDataSchema } from '../../seed/schema.ts';
import { priceOrderItems, calculateTotal } from './pricing.ts';

const seed = seedDataSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../seed/seed-data.json', import.meta.url), 'utf8'),
  ),
);
const latte = seed.menuItems.find((item) => item.name === 'Spanish Latte');
if (!latte) throw new Error('Fixture is missing');
const size = latte.options[0]?.choices[1];
const shot = latte.options[1]?.choices[0];
if (!size || !shot) throw new Error('Fixture options missing');
const input = {
  menuItemId: latte.id,
  quantity: 2,
  choiceIds: [size.id, shot.id],
  notes: '',
};

describe('server pricing and seed integrity', () => {
  it('rejects unavailable option choices and required groups', () => {
    const unavailableChoice = {
      ...latte,
      options: latte.options.map((group) => ({
        ...group,
        choices: group.choices.map((choice) => ({
          ...choice,
          available: choice.id !== shot.id,
        })),
      })),
    };
    expect(() => priceOrderItems([input], [unavailableChoice])).toThrow(
      'unavailable',
    );
    const unavailableGroup = {
      ...latte,
      options: latte.options.map((group, index) => ({
        ...group,
        available: index !== 0,
      })),
    };
    expect(() => priceOrderItems([input], [unavailableGroup])).toThrow(
      'unavailable',
    );
  });
  it('permits omitting unavailable optional groups but not selecting from them', () => {
    const item = {
      ...latte,
      options: latte.options.map((group) => ({
        ...group,
        available: group.minSelections > 0,
      })),
    };
    expect(
      priceOrderItems([{ ...input, choiceIds: [size.id] }], [item])[0]
        ?.unitPriceCents,
    ).toBe(20000);
    expect(() => priceOrderItems([input], [item])).toThrow('unavailable');
  });
  it('rejects too many selections and totals outside PostgreSQL integer range', () => {
    const choices = latte.options[0]!.choices.map((choice) => choice.id);
    expect(() =>
      priceOrderItems([{ ...input, choiceIds: choices }], [latte]),
    ).toThrow('Check selections');
    expect(() =>
      calculateTotal([{ unitPriceCents: 2_147_483_647, quantity: 2 }]),
    ).toThrow('range');
  });
  it('prices selected options per unit using integer cents', () => {
    const items = priceOrderItems([input], seed.menuItems);
    expect(items[0]?.unitPriceCents).toBe(24500);
    expect(calculateTotal(items)).toBe(49000);
  });
  it('rejects missing required, duplicate and foreign choices', () => {
    for (const choiceIds of [
      [],
      [size.id, size.id],
      [size.id, seed.categories[0]!.id],
    ])
      expect(() =>
        priceOrderItems([{ ...input, choiceIds }], seed.menuItems),
      ).toThrow();
  });
  it('rejects unavailable and unknown items', () => {
    expect(() =>
      priceOrderItems([input], [{ ...latte, available: false }]),
    ).toThrow('unavailable');
    expect(() => priceOrderItems([input], [])).toThrow('unavailable');
  });
  it('validates and prices every sample order', () => {
    expect(seed.menuItems).toHaveLength(25);
    for (const order of seed.orders)
      expect(
        calculateTotal(priceOrderItems(order.items, seed.menuItems)),
      ).toBeGreaterThan(0);
  });
});
