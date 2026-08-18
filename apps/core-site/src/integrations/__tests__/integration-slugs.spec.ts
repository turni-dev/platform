import { describe, expect, it } from 'vitest';
import { createIntegrationSlugsSource } from '../integration-slugs';
import type { Integration } from '../integration-schema';

function catalog(...slugs: readonly string[]): { list(): Promise<readonly Integration[]> } {
  return {
    list: () =>
      Promise.resolve(
        slugs.map((slug) => ({
          slug,
          name: slug,
          category: 'other' as const,
          summary: 'Коротко.',
          whatItCan: 'Умеет',
          permissionsAsked: 'Права и зачем.',
          status: 'available' as const
        }))
      )
  };
}

describe('createIntegrationSlugsSource', () => {
  it('gives the sitemap the catalog itself and every integration page', async () => {
    const source = createIntegrationSlugsSource(catalog('google-calendar', 'telegram'));

    await expect(source.list()).resolves.toEqual([
      'integrations',
      'integrations/google-calendar',
      'integrations/telegram'
    ]);
  });

  it('adds nothing to the sitemap when the catalog is empty', async () => {
    await expect(createIntegrationSlugsSource(catalog()).list()).resolves.toEqual([]);
  });

  it('never breaks the sitemap when the CMS is down', async () => {
    const source = createIntegrationSlugsSource({
      list: () => Promise.reject(new Error('cms is down'))
    });

    await expect(source.list()).resolves.toEqual([]);
  });
});
