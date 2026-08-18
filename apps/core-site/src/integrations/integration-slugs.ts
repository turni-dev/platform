import type { SlugSource } from '../content/site-slugs-source';
import { CATALOG_PATH } from './integration-catalog';
import type { IntegrationsSource } from './integrations-source';

/** Слаги без ведущего слэша — карта сайта клеит их с адресом сайта сама. */
const CATALOG_SLUG = CATALOG_PATH.replace(/^\//, '');

/**
 * Каталог для карты сайта: сама витрина и страница каждой интеграции. Пустой
 * каталог (CMS недоступна или интеграции ещё не заведены) не даёт ни одной
 * ссылки — витрину без единой карточки в карте сайта показывать незачем, а
 * `/sitemap.xml` от этого не падает.
 */
export function createIntegrationSlugsSource(integrations: IntegrationsSource): SlugSource {
  return {
    async list(): Promise<readonly string[]> {
      try {
        const catalog = await integrations.list();
        if (catalog.length === 0) {
          return [];
        }

        return [CATALOG_SLUG, ...catalog.map((entry) => `${CATALOG_SLUG}/${entry.slug}`)];
      } catch {
        return [];
      }
    }
  };
}
