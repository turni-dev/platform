import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

export function validateSeedTarget(value) {
  if (value !== 'local' && value !== 'staging') {
    throw new Error('Invalid seed target; expected local or staging');
  }
  return value;
}

export async function seedDemo({ databaseUrl, target }) {
  const validTarget = validateSeedTarget(target);
  const sql = postgres(databaseUrl, { max: 1 });
  const seedUrl = new URL('./seeds/demo.sql', import.meta.url);

  try {
    await sql.begin(async (transaction) => {
      await transaction`
        SELECT set_config('turni.seed_target', ${validTarget}, true)
      `;
      await transaction.file(seedUrl, { cache: false });
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const target = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  if (!target || process.argv.length !== 3) {
    throw new Error('Usage: npm run db:seed -- <local|staging>');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const validTarget = validateSeedTarget(target);
  await seedDemo({ databaseUrl, target: validTarget });
  console.log(`Demo seed applied to ${validTarget}`);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entrypoint === import.meta.url) {
  await main();
}
