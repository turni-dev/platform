import { z } from 'zod';
import type { SiteFetch } from './cms-page-source';
import { seedSlugs } from './seed-page';

export interface SlugSource {
  list(): Promise<readonly string[]>;
}

export interface CmsSlugsSourceOptions {
  readonly baseUrl?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly fetch: SiteFetch;
  readonly onWarning?: (message: string) => void;
}

/** Strapi отдаёт максимум 100 записей за раз. */
const PAGE_SIZE = 100;
/** Защита от бесконечного цикла, если пагинация CMS вернёт мусор. */
const MAX_PAGES = 20;

const SlugsPageSchema = z.object({
  data: z.array(z.object({ slug: z.string().min(1) })),
  meta: z
    .object({
      pagination: z.object({ page: z.number(), pageCount: z.number() })
    })
    .optional()
});

/**
 * Список опубликованных слагов для карты сайта. Читает тот же `/api/pages`,
 * что и `cms-page-source`, но просит только поле `slug` и обходит все
 * страницы пагинации. На любой сбой — как и у `cms-page-source` — отдаём
 * семя, а не падаем: карта сайта не должна зависеть от того, жива ли CMS.
 */
export function createCmsSlugsSource(options: CmsSlugsSourceOptions): SlugSource {
  const warn = (reason: string): readonly string[] => {
    options.onWarning?.(`Sitemap slugs are unavailable (${reason}); serving seed slugs`);

    return seedSlugs;
  };

  return {
    async list(): Promise<readonly string[]> {
      const baseUrl = options.baseUrl?.replace(/\/+$/, '');
      if (baseUrl === undefined || baseUrl.length === 0) {
        return seedSlugs;
      }

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (options.apiToken !== undefined && options.apiToken.length > 0) {
        headers['Authorization'] = `Bearer ${options.apiToken}`;
      }

      const slugs: string[] = [];
      try {
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const query = new URLSearchParams({
            'fields[0]': 'slug',
            'pagination[page]': String(page),
            'pagination[pageSize]': String(PAGE_SIZE)
          });
          const response = await options.fetch(`${baseUrl}/api/pages?${query.toString()}`, {
            headers
          });
          if (!response.ok) {
            return warn(`status ${String(response.status)}`);
          }

          const parsed = SlugsPageSchema.safeParse(JSON.parse(await response.text()));
          if (!parsed.success) {
            return warn('answer did not match the slug list shape');
          }

          for (const entry of parsed.data.data) {
            slugs.push(entry.slug);
          }

          const pagination = parsed.data.meta?.pagination;
          if (pagination === undefined || page >= pagination.pageCount) {
            break;
          }
        }
      } catch {
        return warn('request failed');
      }

      return slugs.length === 0 ? warn('no published pages') : slugs;
    }
  };
}
