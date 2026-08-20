import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    version: integer('version').notNull(),
    capabilityId: text('capability_id').notNull(),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().notNull(),
    permissions: text('permissions').array().notNull().default([]),
    active: boolean('active').default(false).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check('skills_version_check', sql`${table.version} > 0`),
    uniqueIndex('skills_slug_version_uidx').on(table.slug, table.version),
    uniqueIndex('skills_slug_active_uidx')
      .on(table.slug)
      .where(sql`${table.active} = true`)
  ]
);

export const skillsTables = [skills] as const;
