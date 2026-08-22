import type { ReactNode } from 'react';
import { parseLegalMarkdown, type InlineToken, type MarkdownBlock } from './markdown';
import type { LegalDocumentBlock } from './schema';
import styles from './legal-document.module.scss';

function renderTokens(tokens: readonly InlineToken[]): ReactNode[] {
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'bold':
        return <strong key={index}>{token.value}</strong>;
      case 'code':
        return <code key={index}>{token.value}</code>;
      case 'link':
        return (
          <a key={index} href={token.href}>
            {token.value}
          </a>
        );
      case 'text':
      default:
        return <span key={index}>{token.value}</span>;
    }
  });
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3';
      return <Tag key={index}>{renderTokens(block.tokens)}</Tag>;
    }
    case 'paragraph':
      return <p key={index}>{renderTokens(block.tokens)}</p>;
    case 'list':
      return (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderTokens(item)}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <table key={index}>
          <thead>
            <tr>
              {block.headers.map((cell, cellIndex) => (
                <th key={cellIndex}>{renderTokens(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderTokens(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'rule':
      return <hr key={index} />;
    default:
      return null;
  }
}

function formatUpdatedAt(updatedAt: string): string {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return updatedAt;
  }

  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    parsed
  );
}

/**
 * Юридический документ, опубликованный до финальной проверки юриста, всегда
 * несёт явный бейдж об этом — не мелкой строкой внизу, а сразу под
 * заголовком, там, где его нельзя пропустить.
 */
export function LegalDocument({ heading, updatedAt, draft, body }: LegalDocumentBlock) {
  const blocks = parseLegalMarkdown(body);

  return (
    <section className={styles['section']} data-block="blocks.legal-document">
      <div className={styles['inner']}>
        {draft ? (
          <p className={styles['badge']} data-draft-badge="true">
            <span aria-hidden="true">⚠️</span> Черновик — ожидает проверки юриста
          </p>
        ) : null}
        <h1 className={styles['heading']}>{heading}</h1>
        <p className={styles['updated']}>
          Обновлено: <time dateTime={updatedAt}>{formatUpdatedAt(updatedAt)}</time>
        </p>
        <div className={styles['body']}>{blocks.map((block, index) => renderBlock(block, index))}</div>
      </div>
    </section>
  );
}
