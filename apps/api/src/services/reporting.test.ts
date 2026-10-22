import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { cafeDate, dateConditions } from './reporting.ts';
it('uses Manila midnight and parameterized date bounds', () => {
  expect(cafeDate(new Date('2026-10-21T15:59:59Z'))).toBe('2026-10-21');
  expect(cafeDate(new Date('2026-10-21T16:00:00Z'))).toBe('2026-10-22');
  const dialect = new PgDialect();
  const conditions = dateConditions('2026-10-22', '2026-10-23').map((value) =>
    dialect.sqlToQuery(value),
  );
  expect(conditions[0]?.params).toEqual(['2026-10-22', 'Asia/Manila']);
  expect(conditions[1]?.params).toEqual(['2026-10-23', 'Asia/Manila']);
  expect(conditions[1]?.sql).toContain("interval '1 day'");
});
