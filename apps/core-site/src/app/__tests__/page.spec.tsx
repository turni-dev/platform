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

/** `redirect()` бросает специальную ошибку с `NEXT_REDIRECT` в digest —
 * так Next.js передаёт адрес и код редиректа наружу из компонента. */
async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? '';
    if (digest.startsWith('NEXT_REDIRECT')) {
      return digest;
    }
    throw error;
  }
  throw new Error('expected a redirect');
}

describe('site page', () => {
  it('sends the root of the site to the offer with a temporary redirect', async () => {
    const digest = await redirectTarget(() => SitePage(route()));

    expect(digest).toContain('/products/private-agent');
    // Формат digest: `NEXT_REDIRECT;<type>;<url>;<statusCode>;` — 307, не 308.
    expect(digest).toContain(';307;');
  });

  it('sends the root of the site to the offer when metadata is requested', async () => {
    const digest = await redirectTarget(() => generateMetadata(route()));

    expect(digest).toContain('/products/private-agent');
  });

  it('serves the offer at /products/private-agent', async () => {
    const markup = await render(['products', 'private-agent']);

    expect(markup).toContain('data-block="blocks.hero"');
    expect(markup).toContain('data-block="blocks.lead-form"');
  });

  it('no longer carries the chrome inside the page itself', async () => {
    const markup = await render(['products', 'private-agent']);

    expect(markup).not.toContain('data-site="nav"');
    expect(markup).not.toContain('data-site="footer"');
  });

  it('offers exactly one lead form on the page', async () => {
    const markup = await render(['products', 'private-agent']);

    expect(markup.match(/data-block="blocks\.lead-form"/g)).toHaveLength(1);
  });

  it('describes the page for search engines from its own seo, then the site default', async () => {
    const metadata = await generateMetadata(route(['products', 'private-agent']));

    expect(metadata.title).toBe('Turni — ИИ-сотрудник под ключ');
    expect(metadata.description).toContain('ваши процессы');
  });
});
