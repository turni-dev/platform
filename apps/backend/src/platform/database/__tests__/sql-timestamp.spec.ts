import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { timestampColumn, timestampParam } from '../sql-timestamp.js';

const dialect = new PgDialect();
const moment = new Date('2026-08-14T22:31:16.387Z');

describe('timestampParam', () => {
  it('sends a timestamp the postgres driver can serialize', () => {
    const query = dialect.sqlToQuery(sql`SELECT ${timestampParam(moment)}`);

    expect(query.params).toEqual(['2026-08-14T22:31:16.387Z']);
    for (const param of query.params) {
      expect(param).toBeTypeOf('string');
    }
  });

  it('keeps the value a timestamptz for postgres', () => {
    const query = dialect.sqlToQuery(sql`SELECT ${timestampParam(moment)}`);

    expect(query.sql).toContain('::timestamptz');
  });
});

describe('timestampColumn', () => {
  it('reads the text the driver returns for a timestamptz column', () => {
    expect(timestampColumn.parse(moment.toISOString())).toEqual(moment);
  });

  it('still accepts a driver that hands back a Date', () => {
    expect(timestampColumn.parse(moment)).toEqual(moment);
  });

  it('refuses a value that is not a moment at all', () => {
    expect(timestampColumn.safeParse('yesterday').success).toBe(false);
    expect(timestampColumn.safeParse(null).success).toBe(false);
  });
});

describe('timestampColumn with the postgres text format', () => {
  it('reads a timestamptz written the way postgres prints it', () => {
    expect(timestampColumn.parse('2026-08-14 22:31:16.387+00')).toEqual(moment);
  });
});
