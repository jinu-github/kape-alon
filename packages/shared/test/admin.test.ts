import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  adminItemInputSchema,
  categoryInputSchema,
  historyFilterSchema,
  resetSchema,
} from '../src/index.ts';
const item = () => ({
  categoryId: randomUUID(),
  name: 'Toast',
  description: 'Fresh sourdough.',
  imageUrl: 'https://example.com/toast.jpg',
  priceCents: 12500,
  tags: ['vegetarian'],
  available: true,
  options: [
    {
      id: randomUUID(),
      name: 'Bread',
      minSelections: 1,
      maxSelections: 1,
      choices: [{ id: randomUUID(), name: 'Sourdough', priceCents: 0 }],
    },
  ],
});
it('validates nested menu edits and rejects unsafe or inconsistent values', () => {
  expect(adminItemInputSchema.parse(item()).priceCents).toBe(12500);
  for (const value of [
    { ...item(), priceCents: -1 },
    { ...item(), priceCents: 1.5 },
    { ...item(), imageUrl: 'javascript:alert(1)' },
    { ...item(), admin: true },
  ])
    expect(adminItemInputSchema.safeParse(value).success).toBe(false);
  const value = item();
  value.options.push(value.options[0]!);
  expect(adminItemInputSchema.safeParse(value).success).toBe(false);
  value.options[0]!.minSelections = 3;
  expect(adminItemInputSchema.safeParse(value).success).toBe(false);
});
it('validates category, history filters and exact reset confirmation', () => {
  expect(categoryInputSchema.safeParse({ name: ' ' }).success).toBe(false);
  expect(categoryInputSchema.parse({ name: ' Coffee ' }).name).toBe('Coffee');
  for (const value of [
    { from: '2026-02-30' },
    { from: '2026-10-22', to: '2026-10-01' },
    { page: 0 },
    { status: 'unknown' },
  ])
    expect(historyFilterSchema.safeParse(value).success).toBe(false);
  expect(resetSchema.safeParse({ confirmation: 'reset' }).success).toBe(false);
  expect(
    resetSchema.safeParse({ confirmation: 'RESET DEMO DATA' }).success,
  ).toBe(true);
});
