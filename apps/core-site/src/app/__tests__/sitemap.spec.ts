import { describe, expect, it, vi } from 'vitest';
import sitemap, { buildSitemap } from '../sitemap';
import type { SlugSource } from '../../content/site-pages';
import { seedSlugs } from '../../content/seed-page';

function sourceOf(slugs: readonly string[]): SlugSource {
  return { list: () => Promise.resolve(slugs) };
}

describe('buildSitemap', () => {
  it('builds one entry per slug from every source', async () => {
    const entries = await buildSitemap(
      [sourceOf(['products/private-agent']), sourceOf(['legal/privacy'])],
      'https://turni.example'
    );

    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        'https://turni.example/products/private-agent',
        'https://turni.example/legal/privacy'
      ])
    );
    expect(entries).toHaveLength(2);
  });

  it('drops duplicate slugs shared across sources', async () => {
    const entries = await buildSitemap(
      [sourceOf(['products/private-agent']), sourceOf(['products/private-agent'])],
      'https://turni.example'
    );

    expect(entries).toHaveLength(1);
  });

  it('does not fail the sitemap when a source is unavailable', async () => {
    const brokenSource: SlugSource = { list: () => Promise.reject(new Error('CMS is down')) };

    const entries = await buildSitemap(
      [brokenSource, sourceOf(['products/private-agent'])],
      'https://turni.example'
    );

    expect(entries.map((entry) => entry.url)).toEqual([
      'https://turni.example/products/private-agent'
    ]);
  });

  it('never throws even when every source is unavailable', async () => {
    const brokenSource: SlugSource = { list: () => Promise.reject(new Error('CMS is down')) };

    await expect(buildSitemap([brokenSource], 'https://turni.example')).resolves.toEqual([]);
  });
});

describe('sitemap()', () => {
  it('serves the seeded slugs when the CMS is unavailable (no CMS_BASE_URL configured)', async () => {
    vi.stubEnv('CMS_BASE_URL', '');

    const entries = await sitemap();

    expect(entries.map((entry) => entry.url)).toEqual(
      seedSlugs.map((slug) => `http://localhost:3002/${slug}`)
    );

    vi.unstubAllEnvs();
  });
});
