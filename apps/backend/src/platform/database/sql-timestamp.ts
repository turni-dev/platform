import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

/**
 * postgres-js binds parameters as text and refuses a `Date` instance, so every
 * moment written through a raw `sql` template travels as an ISO string with an
 * explicit cast back to `timestamptz`.
 */
export function timestampParam(moment: Date): SQL {
  return sql`${moment.toISOString()}::timestamptz`;
}

/**
 * The same driver reads a `timestamptz` column back as text, so a row schema
 * accepts both the text and a Date and always yields a Date.
 */
export const timestampColumn = z
  // Postgres writes its own text format (`2026-08-14 22:31:16.387+00`), so the
  // shape is left to Date and only unparseable text is rejected.
  .union([z.date(), z.string()])
  .pipe(z.coerce.date());
