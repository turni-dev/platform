import { describe, expect, it } from 'vitest';
import type { AgentFileRecord } from '../../../agent-core/application/agent-file-store.port.js';
import { KnowledgeFaqSource } from '../knowledge-faq-source.js';

const tenantId = '01900000-0000-7000-8000-000000000010';
const agentId = '01900000-0000-7000-8000-000000000011';

function source(content: string | undefined): KnowledgeFaqSource {
  return new KnowledgeFaqSource({
    read: ({ path }): Promise<AgentFileRecord | undefined> =>
      Promise.resolve(
        content === undefined || path !== 'knowledge/faq.md'
          ? undefined
          : { path, revision: 1, content }
      )
  });
}

describe('KnowledgeFaqSource', () => {
  it('turns headings into questions and the text below into answers', async () => {
    const faq = source(
      '## Когда вы работаете?\nЕжедневно с 10:00 до 22:00.\n\n## Есть ли парковка?\nДа, во дворе.\n'
    );

    await expect(faq.entries({ tenantId, agentId })).resolves.toEqual([
      { tenantId, question: 'Когда вы работаете?', response: 'Ежедневно с 10:00 до 22:00.' },
      { tenantId, question: 'Есть ли парковка?', response: 'Да, во дворе.' }
    ]);
  });

  it('keeps a multi-line answer whole', async () => {
    const faq = source('## Как добраться?\nОт метро налево.\nПотом прямо 200 метров.\n');

    await expect(faq.entries({ tenantId, agentId })).resolves.toEqual([
      {
        tenantId,
        question: 'Как добраться?',
        response: 'От метро налево.\nПотом прямо 200 метров.'
      }
    ]);
  });

  it('ignores a heading with nothing under it', async () => {
    const faq = source('## Пусто\n\n## Есть ли парковка?\nДа.\n');

    await expect(faq.entries({ tenantId, agentId })).resolves.toEqual([
      { tenantId, question: 'Есть ли парковка?', response: 'Да.' }
    ]);
  });

  it('ignores text before the first heading', async () => {
    const faq = source('Заметки для себя.\n\n## Есть ли парковка?\nДа.\n');

    await expect(faq.entries({ tenantId, agentId })).resolves.toEqual([
      { tenantId, question: 'Есть ли парковка?', response: 'Да.' }
    ]);
  });

  it('yields nothing when the file does not exist', async () => {
    await expect(source(undefined).entries({ tenantId, agentId })).resolves.toEqual([]);
  });
});
