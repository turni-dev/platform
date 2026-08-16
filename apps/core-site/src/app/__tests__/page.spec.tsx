import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SitePage, { generateMetadata } from '../[[...slug]]/page';

// Без CMS_BASE_URL страница и настройки собираются из семени — как в локальной
// разработке, где Strapi поднимать не нужно.
function route(slug?: string[]): { params: Promise<{ slug?: string[] }> } {
  return { params: Promise.resolve(slug === undefined ? {} : { slug }) };
}

async function render(slug?: string[]): Promise<string> {
  return renderToStaticMarkup(await SitePage(route(slug)));
}

describe('site page', () => {
  it('serves the home page at the root of the site', async () => {
    const markup = await render();

    expect(markup).toContain('data-block="blocks.hero"');
    expect(markup).toContain('data-block="blocks.lead-form"');
  });

  it('no longer carries the chrome inside the page itself', async () => {
    const markup = await render();

    expect(markup).not.toContain('data-site="nav"');
    expect(markup).not.toContain('data-site="footer"');
  });

  it('offers exactly one lead form on the page', async () => {
    const markup = await render();

    expect(markup.match(/data-block="blocks\.lead-form"/g)).toHaveLength(1);
  });

  it('describes the page for search engines from its own seo, then the site default', async () => {
    const metadata = await generateMetadata(route());

    expect(metadata.title).toBe('Turni — ИИ-сотрудник под ключ');
    expect(metadata.description).toContain('ваши процессы');
  });
});
