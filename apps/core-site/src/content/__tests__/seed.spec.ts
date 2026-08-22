import { describe, expect, it } from 'vitest';
import { seedPage, seedSlugs } from '../seed-page';
import { PageSchema } from '../../blocks/page-schema';

describe('seed content', () => {
  it('parses every seeded page with the page schema', () => {
    for (const slug of seedSlugs) {
      expect(() => PageSchema.parse(seedPage(slug))).not.toThrow();
    }
  });

  it('covers the landing sections from the first screen to the form', () => {
    const blocks =
      seedPage('products/private-agent')?.blocks.map((block) => block.__component) ?? [];

    expect(blocks[0]).toBe('blocks.hero');
    expect(blocks).toContain('blocks.steps');
    expect(blocks).toContain('blocks.security-list');
    expect(blocks).toContain('blocks.faq');
    expect(blocks).toContain('blocks.lead-form');
  });

  it('serves the integrations catalog as a page built from the block', () => {
    const page = seedPage('integrations');

    expect(page?.blocks.map((block) => block.__component)).toEqual([
      'blocks.integration-catalog'
    ]);
  });

  it('has nothing for a slug the site does not seed', () => {
    expect(seedPage('unknown-slug')).toBeUndefined();
  });

  it.each([
    'legal/offer',
    'legal/privacy-policy',
    'legal/cookie-policy',
    'legal/dpa-subprocessors'
  ])('serves %s as a single legal-document block marked draft', (slug) => {
    const page = seedPage(slug);

    expect(page?.blocks).toEqual([expect.objectContaining({ __component: 'blocks.legal-document' })]);
    const block = page?.blocks[0];
    expect(block && 'draft' in block ? block.draft : undefined).toBe(true);
  });

  it('excludes the internal "open questions for the lawyer" section from every legal page', () => {
    for (const slug of ['legal/offer', 'legal/privacy-policy', 'legal/cookie-policy', 'legal/dpa-subprocessors']) {
      const block = seedPage(slug)?.blocks[0];
      const body = block && 'body' in block ? block.body : '';

      expect(body).not.toContain('Открытые вопросы для юриста');
      expect(body).not.toContain('ЧЕРНОВИК. Сгенерировано');
    }
  });
});
