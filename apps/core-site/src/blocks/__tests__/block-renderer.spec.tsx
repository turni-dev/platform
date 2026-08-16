import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderBlocks } from '../block-renderer.js';
import type { PageBlock } from '../page-schema.js';

const hero: PageBlock = {
  __component: 'blocks.hero',
  heading: 'Заголовок',
  subheading: 'Подзаголовок',
  primaryCta: { label: 'Обсудить задачу', href: '/brief' }
};

const footer: PageBlock = {
  __component: 'blocks.footer',
  contacts: [],
  legalLinks: []
};

describe('renderBlocks', () => {
  it('keeps the order the editor arranged in the CMS', () => {
    const markup = renderToStaticMarkup(<>{renderBlocks([hero, footer])}</>);

    expect(markup.indexOf('data-block="blocks.hero"')).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf('data-block="blocks.hero"')).toBeLessThan(
      markup.indexOf('data-block="blocks.footer"')
    );
  });

  it('skips a block this frontend does not know yet', () => {
    const unknown = { __component: 'blocks.pricing-table' } as unknown as PageBlock;

    const markup = renderToStaticMarkup(<>{renderBlocks([unknown, footer])}</>);

    expect(markup).toContain('data-block="blocks.footer"');
    expect(markup).not.toContain('blocks.pricing-table');
  });
});
