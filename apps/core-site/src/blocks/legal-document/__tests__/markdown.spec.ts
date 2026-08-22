import { describe, expect, it } from 'vitest';
import { parseInline, parseLegalMarkdown } from '../markdown';

describe('parseInline', () => {
  it('keeps plain text as a single token', () => {
    expect(parseInline('Обычный текст')).toEqual([{ type: 'text', value: 'Обычный текст' }]);
  });

  it('recognizes bold text', () => {
    expect(parseInline('до **важно** после')).toEqual([
      { type: 'text', value: 'до ' },
      { type: 'bold', value: 'важно' },
      { type: 'text', value: ' после' }
    ]);
  });

  it('recognizes inline code', () => {
    expect(parseInline('см. `docs/legal/privacy-policy.md`')).toEqual([
      { type: 'text', value: 'см. ' },
      { type: 'code', value: 'docs/legal/privacy-policy.md' }
    ]);
  });

  it('recognizes a link', () => {
    expect(parseInline('см. [Политику](/legal/privacy-policy) выше')).toEqual([
      { type: 'text', value: 'см. ' },
      { type: 'link', value: 'Политику', href: '/legal/privacy-policy' },
      { type: 'text', value: ' выше' }
    ]);
  });

  it('handles several inline constructs in one line', () => {
    const tokens = parseInline('**Важно:** см. [оферту](/legal/offer) и `docs/legal/offer.md`.');

    expect(tokens).toEqual([
      { type: 'bold', value: 'Важно:' },
      { type: 'text', value: ' см. ' },
      { type: 'link', value: 'оферту', href: '/legal/offer' },
      { type: 'text', value: ' и ' },
      { type: 'code', value: 'docs/legal/offer.md' },
      { type: 'text', value: '.' }
    ]);
  });
});

describe('parseLegalMarkdown', () => {
  it('drops the level-1 heading: the page renders it from the block heading field', () => {
    const blocks = parseLegalMarkdown('# Заголовок документа\n\nАбзац.');

    expect(blocks).toEqual([{ type: 'paragraph', tokens: [{ type: 'text', value: 'Абзац.' }] }]);
  });

  it('reads a level-2 and a level-3 heading', () => {
    const blocks = parseLegalMarkdown('## Раздел\n\n### Подраздел');

    expect(blocks).toEqual([
      { type: 'heading', level: 2, tokens: [{ type: 'text', value: 'Раздел' }] },
      { type: 'heading', level: 3, tokens: [{ type: 'text', value: 'Подраздел' }] }
    ]);
  });

  it('joins wrapped lines of one paragraph and keeps separate paragraphs apart', () => {
    const blocks = parseLegalMarkdown('Первая строка\nвторого предложения.\n\nВторой абзац.');

    expect(blocks).toEqual([
      { type: 'paragraph', tokens: [{ type: 'text', value: 'Первая строка второго предложения.' }] },
      { type: 'paragraph', tokens: [{ type: 'text', value: 'Второй абзац.' }] }
    ]);
  });

  it('reads a horizontal rule as its own block', () => {
    const blocks = parseLegalMarkdown('Абзац.\n\n---\n\nДругой абзац.');

    expect(blocks).toEqual([
      { type: 'paragraph', tokens: [{ type: 'text', value: 'Абзац.' }] },
      { type: 'rule' },
      { type: 'paragraph', tokens: [{ type: 'text', value: 'Другой абзац.' }] }
    ]);
  });

  it('reads a bullet list as one block of items', () => {
    const blocks = parseLegalMarkdown('- Первый пункт\n- Второй пункт');

    expect(blocks).toEqual([
      {
        type: 'list',
        items: [
          [{ type: 'text', value: 'Первый пункт' }],
          [{ type: 'text', value: 'Второй пункт' }]
        ]
      }
    ]);
  });

  it('reads a table with its header and rows', () => {
    const markdown = ['| Уровень | Описание |', '|---|---|', '| 1 | Публичные |'].join('\n');

    const blocks = parseLegalMarkdown(markdown);

    expect(blocks).toEqual([
      {
        type: 'table',
        headers: [
          [{ type: 'text', value: 'Уровень' }],
          [{ type: 'text', value: 'Описание' }]
        ],
        rows: [[[{ type: 'text', value: '1' }], [{ type: 'text', value: 'Публичные' }]]]
      }
    ]);
  });

  it('reads a real fragment of an actual legal draft end to end', () => {
    const markdown = [
      '# Публичная оферта',
      '',
      'Настоящий документ является публичной офертой.',
      '',
      '---',
      '',
      '## 1. Предмет договора',
      '',
      '1.1. Исполнитель обязуется оказать услуги.',
      '',
      '- Первый пункт скоупа',
      '- Второй пункт скоупа',
      '',
      'См. также **Политику обработки персональных данных** (`docs/legal/privacy-policy.md`).'
    ].join('\n');

    const blocks = parseLegalMarkdown(markdown);

    expect(blocks[0]).toEqual({
      type: 'paragraph',
      tokens: [{ type: 'text', value: 'Настоящий документ является публичной офертой.' }]
    });
    expect(blocks[1]).toEqual({ type: 'rule' });
    expect(blocks[2]).toEqual({
      type: 'heading',
      level: 2,
      tokens: [{ type: 'text', value: '1. Предмет договора' }]
    });
    expect(blocks[4]).toEqual({
      type: 'list',
      items: [
        [{ type: 'text', value: 'Первый пункт скоупа' }],
        [{ type: 'text', value: 'Второй пункт скоупа' }]
      ]
    });
  });
});
