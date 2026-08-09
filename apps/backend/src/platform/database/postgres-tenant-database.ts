import { drizzle } from 'drizzle-orm/postgres-js';
import type { SQL } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { z } from 'zod';
import type { TenantDatabase, TenantTransaction } from './with-tenant.js';

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === 'postgres:' || protocol === 'postgresql:';
    },
    { message: 'DATABASE_URL must use the postgres:// or postgresql:// protocol' }
  );

interface CloseablePostgresClient {
  end(): Promise<void>;
}

interface DrizzleTenantTransaction {
  execute(query: SQL): Promise<unknown>;
}

interface DrizzleTenantDatabase {
  transaction<T>(
    operation: (transaction: DrizzleTenantTransaction) => Promise<T>
  ): Promise<T>;
}

export interface PostgresTenantDatabase extends TenantDatabase {
  readonly database: TenantDatabase;
  close(): Promise<void>;
}

export interface PostgresTenantDatabaseOptions {
  databaseUrl?: string;
  clientFactory?: (databaseUrl: string) => CloseablePostgresClient;
  databaseFactory?: (client: CloseablePostgresClient) => DrizzleTenantDatabase;
}

class DrizzlePostgresTenantDatabase implements PostgresTenantDatabase {
  public constructor(
    private readonly drizzleDatabase: DrizzleTenantDatabase,
    private readonly client: CloseablePostgresClient
  ) {}

  public get database(): TenantDatabase {
    return this;
  }

  public transaction<T>(
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    return this.drizzleDatabase.transaction(operation);
  }

  public close(): Promise<void> {
    return this.client.end();
  }
}

export function createPostgresTenantDatabase(
  input: string | PostgresTenantDatabaseOptions = {}
): PostgresTenantDatabase {
  const options = typeof input === 'string' ? { databaseUrl: input } : input;
  const databaseUrl = databaseUrlSchema.parse(
    options.databaseUrl ?? process.env['DATABASE_URL']
  );
  const clientFactory = options.clientFactory ?? createPostgresClient;
  const databaseFactory = options.databaseFactory ?? createDrizzleDatabase;
  const client = clientFactory(databaseUrl);

  return new DrizzlePostgresTenantDatabase(databaseFactory(client), client);
}

function createPostgresClient(databaseUrl: string): CloseablePostgresClient {
  return postgres(databaseUrl);
}

function createDrizzleDatabase(client: CloseablePostgresClient): DrizzleTenantDatabase {
  return drizzle(client as Sql);
}
