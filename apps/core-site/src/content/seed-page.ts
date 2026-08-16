import { PageSchema, type Page } from '../blocks/page-schema';
import privateAgent from './seed/private-agent.json' with { type: 'json' };

/**
 * Страницы, которые сайт умеет показать без CMS. Семя держит лендинг живым,
 * когда Strapi недоступен, и снимает с локальной разработки требование
 * поднимать CMS ради одной вёрстки.
 */
const seeds: Readonly<Record<string, unknown>> = { 'products/private-agent': privateAgent };

export const seedSlugs: readonly string[] = Object.keys(seeds);

export function seedPage(slug: string): Page | undefined {
  const seed = seeds[slug];
  if (seed === undefined) {
    return undefined;
  }

  return PageSchema.parse(seed);
}

/** Для страниц, которые обязаны существовать в сборке, — например главной. */
export function requireSeedPage(slug: string): Page {
  const page = seedPage(slug);
  if (page === undefined) {
    throw new Error(`Seed content for "${slug}" is missing`);
  }

  return page;
}
