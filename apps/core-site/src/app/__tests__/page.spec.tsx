import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from '../page.js';

// Без CMS_BASE_URL страница собирается из семени — ровно как в локальной разработке.
async function render(): Promise<string> {
  return renderToStaticMarkup(await HomePage());
}

describe('home page', () => {
  it('is assembled from blocks, navigation through footer', async () => {
    const markup = await render();

    expect(markup).toContain('data-block="blocks.nav"');
    expect(markup).toContain('data-block="blocks.hero"');
    expect(markup).toContain('data-block="blocks.footer"');
  });

  it('offers exactly one lead form on the page', async () => {
    const markup = await render();

    expect(markup.match(/data-block="blocks\.lead-form"/g)).toHaveLength(1);
  });
});
