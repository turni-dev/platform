import { createCmsPageSource, type PageSource } from './cms-page-source';
import { createBookingSlotsSource, type BookingSlotOption } from '../site/booking-slots-source';
import { createNavigationSource } from '../site/navigation-source';
import { createSiteSettingsSource } from '../site/site-settings-source';
import type { NavItem, SiteSettings } from '../site/site-settings-schema';

const connection = {
  baseUrl: process.env['CMS_BASE_URL'],
  apiToken: process.env['CMS_API_TOKEN'],
  fetch: (url: string, init: Readonly<{ headers: Readonly<Record<string, string>> }>) =>
    fetch(url, { ...init, next: { revalidate: 60 } }),
  onWarning: (message: string): void => {
    console.warn(message);
  }
};

/**
 * Единственное место, где сайт узнаёт адрес CMS. Переменной нет — работаем на
 * семени, поэтому локальная разработка не требует поднятого Strapi.
 */
export const sitePages: PageSource = createCmsPageSource(connection);

export const siteSettings: { get(): Promise<SiteSettings> } =
  createSiteSettingsSource(connection);

/** Меню живёт в плагине навигации, а не в настройках сайта. */
export const siteNavigation: { get(): Promise<readonly NavItem[]> } =
  createNavigationSource(connection);

/** Слоты консультаций администрирует владелец в CMS; на сайте они необязательны. */
export const siteBookingSlots: { get(): Promise<readonly BookingSlotOption[]> } =
  createBookingSlotsSource(connection);
