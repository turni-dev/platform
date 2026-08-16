import { z } from 'zod';
import type { SiteFetch } from '../content/cms-page-source';
import seed from './seed/navigation.json' with { type: 'json' };
import { NavItemSchema, type NavItem } from './site-settings-schema';

/**
 * Дерево от `strapi-plugin-navigation`. У плагина свои имена полей, поэтому
 * приводим их к нашим прямо на границе: компонент шапки про плагин не знает.
 */
const PluginNavItemSchema: z.ZodType<NavItem> = z
  .object({
    title: z.string().min(1),
    path: z.string().min(1),
    items: z.array(z.lazy(() => PluginNavItemSchema)).optional()
  })
  .transform((item) => ({
    label: item.title,
    href: item.path,
    ...(item.items === undefined || item.items.length === 0
      ? {}
      : { children: item.items.map(({ label, href }) => ({ label, href })) })
  }));

export const seedNavigation: readonly NavItem[] = z.array(NavItemSchema).parse(seed);

export interface NavigationSourceOptions {
  readonly baseUrl?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly fetch: SiteFetch;
  readonly onWarning?: (message: string) => void;
  /** Слаг меню в плагине; из коробки он заводит меню `navigation`. */
  readonly menu?: string;
}

export function createNavigationSource(
  options: NavigationSourceOptions
): { get(): Promise<readonly NavItem[]> } {
  return {
    async get(): Promise<readonly NavItem[]> {
      const baseUrl = options.baseUrl?.replace(/\/+$/, '');
      if (baseUrl === undefined || baseUrl.length === 0) {
        return seedNavigation;
      }

      const menu = options.menu ?? 'navigation';
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.apiToken !== undefined && options.apiToken.length > 0) {
          headers['Authorization'] = `Bearer ${options.apiToken}`;
        }

        const response = await options.fetch(
          `${baseUrl}/api/navigation/render/${menu}?type=TREE`,
          { headers }
        );
        if (!response.ok) {
          return warn(options, `status ${String(response.status)}`);
        }

        const tree = z
          .array(PluginNavItemSchema)
          .safeParse(JSON.parse(await response.text()));

        if (!tree.success) {
          return warn(options, 'answer did not match the menu shape');
        }

        // Пустое меню значит «ещё не заполнили»: показывать шапку без единой
        // ссылки хуже, чем показать те пункты, что лежат в репозитории.
        return tree.data.length === 0 ? warn(options, 'menu is empty') : tree.data;
      } catch {
        return warn(options, 'request failed');
      }
    }
  };
}

function warn(options: NavigationSourceOptions, reason: string): readonly NavItem[] {
  options.onWarning?.(`Navigation is unavailable (${reason}); serving seed menu`);

  return seedNavigation;
}
