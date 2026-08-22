import { PageSchema, type Page } from '../blocks/page-schema';
import cookiePolicy from './seed/cookie-policy.json' with { type: 'json' };
import dpaSubprocessors from './seed/dpa-subprocessors.json' with { type: 'json' };
import integrations from './seed/integrations.json' with { type: 'json' };
import offer from './seed/offer.json' with { type: 'json' };
import privacyPolicy from './seed/privacy-policy.json' with { type: 'json' };
import privateAgent from './seed/private-agent.json' with { type: 'json' };

/**
 * Страницы, которые сайт умеет показать без CMS. Семя держит лендинг живым,
 * когда Strapi недоступен, и снимает с локальной разработки требование
 * поднимать CMS ради одной вёрстки.
 *
 * Юридические страницы (`legal/*`) — черновики от ИИ по мотивам
 * `docs/legal/*.md`, опубликованные владельцем до финальной проверки
 * юриста; блок `blocks.legal-document` показывает это явным бейджем на
 * самой странице, а не мелкой сноской.
 */
const seeds: Readonly<Record<string, unknown>> = {
  'products/private-agent': privateAgent,
  integrations,
  'legal/offer': offer,
  'legal/privacy-policy': privacyPolicy,
  'legal/cookie-policy': cookiePolicy,
  'legal/dpa-subprocessors': dpaSubprocessors
};

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
