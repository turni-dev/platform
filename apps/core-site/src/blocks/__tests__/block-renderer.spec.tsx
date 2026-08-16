import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderBlocks } from '../block-renderer';
import type { PageBlock } from '../page-schema';

const hero: PageBlock = {
  __component: 'blocks.hero',
  heading: 'Заголовок',
  subheading: 'Подзаголовок',
  primaryCta: { label: 'Обсудить задачу', href: '/brief' }
};

const faq: PageBlock = {
  __component: 'blocks.faq',
  heading: 'Вопросы',
  items: [{ question: 'Где данные?', answer: 'На вашем сервере.' }]
};

describe('renderBlocks', () => {
  it('keeps the order the editor arranged in the CMS', () => {
    const markup = renderToStaticMarkup(<>{renderBlocks([hero, faq])}</>);

    expect(markup.indexOf('data-block="blocks.hero"')).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf('data-block="blocks.hero"')).toBeLessThan(
      markup.indexOf('data-block="blocks.faq"')
    );
  });

  it('skips a block this frontend does not know yet', () => {
    const unknown = { __component: 'blocks.pricing-table' } as unknown as PageBlock;

    const markup = renderToStaticMarkup(<>{renderBlocks([unknown, faq])}</>);

    expect(markup).toContain('data-block="blocks.faq"');
    expect(markup).not.toContain('blocks.pricing-table');
  });
});
