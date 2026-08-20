import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { skills } from '../schema.js';

describe('skills database schema', () => {
  it('is a global catalogue with no RLS', () => {
    expect(getTableConfig(skills).enableRLS).toBe(false);
    expect(getTableConfig(skills).name).toBe('skills');
  });

  it('allows one active version per slug', () => {
    const config = getTableConfig(skills);
    const versionIndex = config.indexes.find(
      (index) => index.config.name === 'skills_slug_version_uidx'
    );
    const activeIndex = config.indexes.find(
      (index) => index.config.name === 'skills_slug_active_uidx'
    );

    expect(versionIndex?.config.unique).toBe(true);
    expect(activeIndex?.config.unique).toBe(true);
    expect(activeIndex?.config.where).toBeDefined();
  });

  it('rejects a non-positive version at the database layer', () => {
    expect(getTableConfig(skills).checks.map((check) => check.name)).toEqual([
      'skills_version_check'
    ]);
  });
});
