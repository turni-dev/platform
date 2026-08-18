import type { MetadataRoute } from 'next';
import { siteSlugSources, type SlugSource } from '../content/site-pages';

/** Даёт странице свежие ссылки без пересборки каждый раз, когда правят CMS. */
export const revalidate = 60;

function siteUrl(): string {
  const raw = process.env['SITE_URL'];
  const base = raw === undefined || raw.length === 0 ? 'http://localhost:3002' : raw;

  return base.replace(/\/+$/, '');
}

/**
 * Каждый источник уже отдаёт семя при недоступной CMS (см. `site-slugs-source`),
 * но карта сайта не должна упасть, даже если будущий источник (например,
 * каталог интеграций) этого правила не выдержит: один сбойный источник не
 * должен превращать `/sitemap.xml` в 500.
 */
async function collectSlugs(sources: readonly SlugSource[]): Promise<readonly string[]> {
  const lists = await Promise.all(
    sources.map(async (source) => {
      try {
        return await source.list();
      } catch {
        return [];
      }
    })
  );

  return Array.from(new Set(lists.flat()));
}

export async function buildSitemap(
  sources: readonly SlugSource[],
  base: string
): Promise<MetadataRoute.Sitemap> {
  const slugs = await collectSlugs(sources);

  return slugs.map((slug) => ({
    url: `${base}/${slug}`,
    lastModified: new Date()
  }));
}

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(siteSlugSources, siteUrl());
}
