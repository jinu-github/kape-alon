import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { cafeConfig } from '@kape/shared';
import { orders } from '../db/schema.ts';
export function cafeDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: cafeConfig.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function dateConditions(from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from)
    conditions.push(
      sql`${orders.createdAt} >= (${from}::date::timestamp AT TIME ZONE ${cafeConfig.timezone})`,
    );
  if (to)
    conditions.push(
      sql`${orders.createdAt} < ((${to}::date + interval '1 day') AT TIME ZONE ${cafeConfig.timezone})`,
    );
  return conditions;
}
