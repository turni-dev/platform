import { createCmsPageSource, type PageSource } from './cms-page-source.js';

/**
 * Единственное место, где сайт узнаёт адрес CMS. Переменной нет — работаем на
 * семени, поэтому локальная разработка не требует поднятого Strapi.
 */
export const sitePages: PageSource = createCmsPageSource({
  baseUrl: process.env['CMS_BASE_URL'],
  apiToken: process.env['CMS_API_TOKEN'],
  fetch: (url, init) => fetch(url, { ...init, next: { revalidate: 60 } }),
  onWarning: (message) => {
    console.warn(message);
  }
});
