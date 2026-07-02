import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema:
    './apps/backend/src/modules/**/infrastructure/database/schema.ts',
  out: './tmp/drizzle',
  strict: true,
  verbose: true
});
