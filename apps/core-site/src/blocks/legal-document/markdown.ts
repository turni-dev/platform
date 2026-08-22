/**
 * Минимальный markdown под юридические документы: заголовки, абзацы, списки,
 * таблицы, горизонтальные разделители и четыре инлайн-конструкции (жирный
 * текст, код, ссылка, обычный текст). Юрист правит `docs/legal/*.md` в
 * привычном markdown — сайт не заводит для этого отдельный формат в CMS.
 * Разобрано отдельно от рендера, чтобы логика проверялась без react-dom.
 */

export type InlineToken =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'bold'; readonly value: string }
  | { readonly type: 'code'; readonly value: string }
  | { readonly type: 'link'; readonly value: string; readonly href: string };

export type MarkdownBlock =
  | { readonly type: 'heading'; readonly level: 2 | 3; readonly tokens: readonly InlineToken[] }
  | { readonly type: 'paragraph'; readonly tokens: readonly InlineToken[] }
  | { readonly type: 'list'; readonly items: readonly (readonly InlineToken[])[] }
  | {
      readonly type: 'table';
      readonly headers: readonly (readonly InlineToken[])[];
      readonly rows: readonly (readonly InlineToken[])[][];
    }
  | { readonly type: 'rule' };

const INLINE_PATTERN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

/** Разбирает жирный текст, инлайн-код и ссылки внутри одной строки. */
export function parseInline(text: string): readonly InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index;
    if (index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, index) });
    }

    const bold = match[1];
    const code = match[2];
    const linkText = match[3];
    const linkHref = match[4];
    if (bold !== undefined) {
      tokens.push({ type: 'bold', value: bold });
    } else if (code !== undefined) {
      tokens.push({ type: 'code', value: code });
    } else if (linkText !== undefined && linkHref !== undefined) {
      tokens.push({ type: 'link', value: linkText, href: linkHref });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

/** Строка вида `| a | b |` → `['a', 'b']`, без пустых крайних ячеек от рамки. */
function splitRow(line: string): string[] {
  const cells = line.split('|');
  if (cells[0]?.trim() === '') {
    cells.shift();
  }
  if (cells[cells.length - 1]?.trim() === '') {
    cells.pop();
  }
  return cells.map((cell) => cell.trim());
}

const HEADING_2_3 = /^(#{2,3})\s+(.*)$/;
const HEADING_1 = /^#\s+/;

/**
 * Заголовок первого уровня документа не попадает в блоки: он приходит из
 * поля `heading` компонента и рендерится страницей отдельно, чтобы страница
 * не показывала один и тот же заголовок дважды.
 */
export function parseLegalMarkdown(markdown: string): readonly MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();

    if (line === '') {
      i += 1;
      continue;
    }

    if (line === '---') {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    const heading = HEADING_2_3.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length === 3 ? 3 : 2;
      blocks.push({ type: 'heading', level, tokens: parseInline(heading[2] ?? '') });
      i += 1;
      continue;
    }

    if (HEADING_1.test(line)) {
      i += 1;
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        tableLines.push((lines[i] ?? '').trim());
        i += 1;
      }
      const [headerLine, , ...rowLines] = tableLines;
      blocks.push({
        type: 'table',
        headers: headerLine === undefined ? [] : splitRow(headerLine).map(parseInline),
        rows: rowLines.map((row) => splitRow(row).map(parseInline))
      });
      continue;
    }

    if (line.startsWith('- ')) {
      const items: (readonly InlineToken[])[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('- ')) {
        items.push(parseInline((lines[i] ?? '').trim().slice(2)));
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = (lines[i] ?? '').trim();
      if (
        current === '' ||
        current === '---' ||
        HEADING_2_3.test(current) ||
        HEADING_1.test(current) ||
        current.startsWith('|') ||
        current.startsWith('- ')
      ) {
        break;
      }
      paragraphLines.push(current);
      i += 1;
    }
    blocks.push({ type: 'paragraph', tokens: parseInline(paragraphLines.join(' ')) });
  }

  return blocks;
}
