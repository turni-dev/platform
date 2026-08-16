import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from '../page.js';

describe('home page', () => {
  it('is assembled from the seeded blocks, navigation through footer', () => {
    const markup = renderToStaticMarkup(<HomePage />);

    expect(markup).toContain('data-block="blocks.nav"');
    expect(markup).toContain('data-block="blocks.hero"');
    expect(markup).toContain('data-block="blocks.footer"');
  });

  it('offers exactly one lead form on the page', () => {
    const markup = renderToStaticMarkup(<HomePage />);

    expect(markup.match(/data-block="blocks\.lead-form"/g)).toHaveLength(1);
  });
});
