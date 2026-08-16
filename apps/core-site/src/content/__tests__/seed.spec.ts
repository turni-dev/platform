import { describe, expect, it } from 'vitest';
import { seedPage, seedSlugs } from '../seed-page.js';
import { PageSchema } from '../../blocks/page-schema.js';

describe('seed content', () => {
  it('parses every seeded page with the page schema', () => {
    for (const slug of seedSlugs) {
      expect(() => PageSchema.parse(seedPage(slug))).not.toThrow();
    }
  });

  it('covers the landing sections from navigation to footer', () => {
    const blocks = seedPage('home')?.blocks.map((block) => block.__component) ?? [];

    expect(blocks[0]).toBe('blocks.nav');
    expect(blocks.at(-1)).toBe('blocks.footer');
    expect(blocks).toContain('blocks.hero');
    expect(blocks).toContain('blocks.steps');
    expect(blocks).toContain('blocks.security-list');
    expect(blocks).toContain('blocks.faq');
    expect(blocks).toContain('blocks.lead-form');
  });

  it('has nothing for a slug the site does not seed', () => {
    expect(seedPage('unknown-slug')).toBeUndefined();
  });
});
