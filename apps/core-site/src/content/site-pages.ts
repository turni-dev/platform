import { createCmsPageSource, type PageSource } from './cms-page-source';
import { createCmsSlugsSource, type SlugSource } from './site-slugs-source';
import { createBookingSlotsSource, type BookingSlotOption } from '../site/booking-slots-source';
import { readCmsEnv } from '../config/cms-env';
import { createIntegrationSlugsSource } from '../integrations/integration-slugs';
import { createIntegrationsSource, type IntegrationsSource } from '../integrations/integrations-source';
import { createNavigationSource } from '../site/navigation-source';
import { createSiteSettingsSource } from '../site/site-settings-source';
import type { NavItem, SiteSettings } from '../site/site-settings-schema';

export type { SlugSource };

const env = readCmsEnv();

/**
 * Единственное место, где сайт узнаёт адрес CMS и её read-only токен.
 * `CMS_READ_TOKEN` в Strapi даёт только `find`/`findOne` на страницы,
 * настройки, навигацию, каталог интеграций и доступность слотов — никогда
 * `create`/`update`/`delete` (см. `apps/cms/README.md`). Переменной нет —
 * работаем на семени, поэтому локальная разработка не требует поднятого Strapi.
 */
const connection = {
  baseUrl: env.CMS_BASE_URL,
  apiToken: env.CMS_READ_TOKEN,
  fetch: (url: string, init: Readonly<{ headers: Readonly<Record<string, string>> }>) =>
    fetch(url, { ...init, next: { revalidate: 60 } }),
  onWarning: (message: string): void => {
    console.warn(message);
  }
};

export const sitePages: PageSource = createCmsPageSource(connection);

export const siteSettings: { get(): Promise<SiteSettings> } =
  createSiteSettingsSource(connection);

/** Меню живёт в плагине навигации, а не в настройках сайта. */
export const siteNavigation: { get(): Promise<readonly NavItem[]> } =
  createNavigationSource(connection);

/** Слоты консультаций администрирует владелец в CMS; на сайте они необязательны. */
export const siteBookingSlots: { get(): Promise<readonly BookingSlotOption[]> } =
  createBookingSlotsSource(connection);

/** Каталог интеграций: витрина, страницы карточек и стена логотипов на главной. */
export const siteIntegrations: IntegrationsSource = createIntegrationsSource(connection);

/** Слаги каталога для карты сайта: `/integrations` и карточка каждой интеграции. */
export const integrationSlugs: SlugSource = createIntegrationSlugsSource(siteIntegrations);

/**
 * Слаги опубликованных страниц сайта — вход для карты сайта.
 * `siteSlugSources` — точка расширения: второй источник слагов (например,
 * каталог интеграций на `/integrations/*`) подключается добавлением
 * элемента в этот массив, без переписывания `sitemap.ts`.
 */
export const sitePageSlugs: SlugSource = createCmsSlugsSource(connection);

export const siteSlugSources: readonly SlugSource[] = [sitePageSlugs, integrationSlugs];

/**
 * Адрес кабинета. Пока переменная не задана, кнопка «Подключить» вести некуда,
 * и карточка честно просит оставить заявку вместо ссылки в пустоту.
 */
export const cabinetUrl: string | undefined = env.CABINET_BASE_URL;
