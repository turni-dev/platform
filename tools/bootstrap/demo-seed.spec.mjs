import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { validateSeedTarget } from './demo-seed.mjs';

const seedUrl = new URL('./seeds/demo.sql', import.meta.url);

describe('demo seed bootstrap', () => {
  it('accepts only isolated local and staging targets', () => {
    assert.equal(validateSeedTarget('local'), 'local');
    assert.equal(validateSeedTarget('staging'), 'staging');
    assert.throws(() => validateSeedTarget('production'), /Invalid seed target/);
  });

  it('seeds the complete demo slice idempotently', async () => {
    const seed = await readFile(seedUrl, 'utf8');

    for (const table of [
      'tenants',
      'locations',
      'users',
      'agents',
      'channel_connections',
      'guests',
      'conversations',
      'messages',
      'memory_files',
      'memory_revisions'
    ]) {
      assert.match(seed, new RegExp(`INSERT INTO ${table}`));
    }
    assert.equal(seed.match(/ON CONFLICT/g)?.length, 10);
  });

  it('contains no real credentials and discloses the AI agent', async () => {
    const seed = await readFile(seedUrl, 'utf8');

    assert.doesNotMatch(seed, /credentials_enc\s*[,)]/i);
    assert.match(seed, /Я ИИ-помощник/);
  });
});
