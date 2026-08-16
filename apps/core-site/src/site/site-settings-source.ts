import { withoutNulls, type SiteFetch } from '../content/cms-page-source';
import seed from './seed/site-settings.json' with { type: 'json' };
import { SiteSettingsSchema, type SiteSettings } from './site-settings-schema';

export const seedSettings: SiteSettings = SiteSettingsSchema.parse(seed);

export interface SiteSettingsSourceOptions {
  readonly baseUrl?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly fetch: SiteFetch;
  readonly onWarning?: (message: string) => void;
}

/**
 * Шапка и подвал одинаковы на всех страницах, поэтому живут отдельным типом в
 * CMS, а не блоками внутри каждой страницы. Как и страницы, настройки падают
 * на семя, если CMS недоступна.
 */
export function createSiteSettingsSource(
  options: SiteSettingsSourceOptions
): { get(): Promise<SiteSettings> } {
  return {
    async get(): Promise<SiteSettings> {
      const baseUrl = options.baseUrl?.replace(/\/+$/, '');
      if (baseUrl === undefined || baseUrl.length === 0) {
        return seedSettings;
      }

      const query = new URLSearchParams({
        'populate[nav][populate]': '*',
        'populate[navCta][populate]': '*',
        'populate[footerContacts][populate]': '*',
        'populate[footerLegalLinks][populate]': '*',
        'populate[defaultSeo][populate]': '*'
      });

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.apiToken !== undefined && options.apiToken.length > 0) {
          headers['Authorization'] = `Bearer ${options.apiToken}`;
        }

        const response = await options.fetch(
          `${baseUrl}/api/site-setting?${query.toString()}`,
          { headers }
        );
        if (!response.ok) {
          return warn(options, `status ${String(response.status)}`);
        }

        const body: unknown = JSON.parse(await response.text());
        const data =
          typeof body === 'object' && body !== null && 'data' in body ? body.data : undefined;
        const settings = SiteSettingsSchema.safeParse(withoutNulls(data));

        return settings.success ? settings.data : warn(options, 'answer did not match the schema');
      } catch {
        return warn(options, 'request failed');
      }
    }
  };
}

function warn(options: SiteSettingsSourceOptions, reason: string): SiteSettings {
  options.onWarning?.(`Site settings are unavailable (${reason}); serving seed content`);

  return seedSettings;
}
