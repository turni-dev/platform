import { withoutNulls, type SiteFetch } from '../content/cms-page-source';
import { IntegrationSchema, type Integration } from './integration-schema';

export interface IntegrationsSourceOptions {
  readonly baseUrl?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly fetch: SiteFetch;
  readonly onWarning?: (message: string) => void;
}

/** Каталог редактируется руками и остаётся небольшим — одной страницы хватает. */
const PAGE_SIZE = 100;

export interface IntegrationsSource {
  list(): Promise<readonly Integration[]>;
}

/**
 * Каталог интеграций из CMS. Семени здесь нет намеренно: витрина обязана
 * показывать то, что реально включено в админке, поэтому недоступная CMS даёт
 * пустой каталог и живую страницу, а не устаревший список из репозитория.
 */
export function createIntegrationsSource(options: IntegrationsSourceOptions): IntegrationsSource {
  return {
    async list(): Promise<readonly Integration[]> {
      const baseUrl = options.baseUrl?.replace(/\/+$/, '');
      if (baseUrl === undefined || baseUrl.length === 0) {
        return [];
      }

      const query = new URLSearchParams({
        'populate[logo]': '*',
        'sort[0]': 'order:asc',
        'sort[1]': 'name:asc',
        'pagination[pageSize]': String(PAGE_SIZE)
      });

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.apiToken !== undefined && options.apiToken.length > 0) {
          headers['Authorization'] = `Bearer ${options.apiToken}`;
        }

        const response = await options.fetch(
          `${baseUrl}/api/integrations?${query.toString()}`,
          { headers }
        );
        if (!response.ok) {
          return warn(options, `status ${String(response.status)}`);
        }

        const body: unknown = JSON.parse(await response.text());
        const data =
          typeof body === 'object' && body !== null && 'data' in body ? body.data : undefined;
        if (!Array.isArray(data)) {
          return warn(options, 'answer did not match the catalog shape');
        }

        // Разбираем каждую запись отдельно: одна недозаполненная карточка не
        // должна прятать весь каталог — она просто не выходит на витрину.
        const integrations: Integration[] = [];
        for (const entry of data) {
          const parsed = IntegrationSchema.safeParse(withoutNulls(entry));
          if (parsed.success) {
            integrations.push(parsed.data);
          } else {
            options.onWarning?.('An integration entry did not match the schema and was skipped');
          }
        }

        return sorted(integrations);
      } catch {
        return warn(options, 'request failed');
      }
    }
  };
}

/**
 * Сортировка повторяется на нашей стороне: порядок задаёт редактор полем
 * `order`, но записи без него не должны прыгать между сборками.
 */
function sorted(integrations: readonly Integration[]): readonly Integration[] {
  return [...integrations].sort((left, right) => {
    const byOrder = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);

    return byOrder === 0 ? left.name.localeCompare(right.name, 'ru') : byOrder;
  });
}

function warn(options: IntegrationsSourceOptions, reason: string): readonly Integration[] {
  options.onWarning?.(`Integration catalog is unavailable (${reason}); serving an empty catalog`);

  return [];
}
