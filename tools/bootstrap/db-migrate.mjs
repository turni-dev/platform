import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

const migrationPattern = /^(\d{4})_[a-z0-9_]+(?:\.concurrent)?\.sql$/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walk(path)));
    } else if (entry.isFile() && entry.name.endsWith('.sql')) {
      paths.push(path);
    }
  }

  return paths;
}

export function validateMigrations(migrations) {
  const sequences = new Set();

  for (const migration of migrations) {
    const match = migrationPattern.exec(migration.name);
    if (!match) {
      throw new Error(`invalid migration name: ${migration.name}`);
    }

    const sequence = match[1];
    if (sequences.has(sequence)) {
      throw new Error(`duplicate migration sequence ${sequence}`);
    }
    sequences.add(sequence);
  }

  return migrations;
}

export async function discoverMigrations(modulesRoot) {
  const root = modulesRoot instanceof URL
    ? fileURLToPath(modulesRoot)
    : modulesRoot;
  const paths = await walk(root);
  const migrations = paths
    .filter((path) => path.includes(`${join('database', 'migrations')}`))
    .map((path) => ({
      name: basename(path),
      path,
      transactional: !path.endsWith('.concurrent.sql')
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return validateMigrations(migrations);
}

export function checksumMigration(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function assertConcurrentMigrationIsRetrySafe(migration, contents) {
  if (
    !migration.transactional &&
    !/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS/i.test(contents)
  ) {
    throw new Error(
      `concurrent migration must be retry-safe with IF NOT EXISTS: ${migration.name}`
    );
  }
}

async function loadMigrations(modulesRoot) {
  const migrations = await discoverMigrations(modulesRoot);

  return Promise.all(
    migrations.map(async (migration) => {
      const contents = await readFile(migration.path, 'utf8');
      assertConcurrentMigrationIsRetrySafe(migration, contents);
      return {
        ...migration,
        contents,
        checksum: checksumMigration(contents)
      };
    })
  );
}

export async function migrate({ databaseUrl, modulesRoot }) {
  const migrations = await loadMigrations(modulesRoot);
  const sql = postgres(databaseUrl, { max: 1 });
  let locked = false;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS turni_schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`SELECT pg_advisory_lock(hashtext('turni:schema-migrations'))`;
    locked = true;

    const appliedRows = await sql`SELECT name, checksum FROM turni_schema_migrations`;
    const applied = new Map(
      appliedRows.map((row) => [row.name, row.checksum.trim()])
    );

    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.name);
      if (previousChecksum === migration.checksum) {
        continue;
      }
      if (previousChecksum !== undefined) {
        throw new Error(`checksum mismatch for applied migration ${migration.name}`);
      }

      if (migration.transactional) {
        await sql.begin(async (transaction) => {
          await transaction.file(migration.path, { cache: false });
          await transaction`
            INSERT INTO turni_schema_migrations (name, checksum)
            VALUES (${migration.name}, ${migration.checksum})
          `;
        });
      } else {
        await sql.file(migration.path, { cache: false });
        await sql`
          INSERT INTO turni_schema_migrations (name, checksum)
          VALUES (${migration.name}, ${migration.checksum})
        `;
      }

      console.log(`applied ${migration.name}`);
    }
  } finally {
    if (locked) {
      await sql`SELECT pg_advisory_unlock(hashtext('turni:schema-migrations'))`;
    }
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const modulesRoot = new URL('../../apps/backend/src/modules/', import.meta.url);
  const checkOnly = process.argv.slice(2).includes('--check');

  if (checkOnly) {
    const migrations = await loadMigrations(modulesRoot);
    console.log(`validated ${migrations.length} database migrations`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  await migrate({ databaseUrl, modulesRoot });
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entrypoint === import.meta.url) {
  await main();
}
