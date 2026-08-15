import type {
  AgentFileRecord,
  AgentFileStorePort
} from '../../agent-core/application/agent-file-store.port.js';
import type { FrontlineFaqEntry } from './frontline-workflow.js';

/** The one knowledge file FrontLine reads. Owners edit it in the cabinet. */
export const faqPath = 'knowledge/faq.md';

const headingPrefix = '## ';

export interface KnowledgeFileReader {
  read(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<AgentFileRecord | undefined>;
}

/**
 * Turns the owner's markdown into FrontLine entries: a `##` heading is a
 * question, everything under it until the next heading is the answer. The
 * format is deliberately the plainest thing an owner can type without being
 * taught a syntax, and anything outside it is ignored rather than guessed at.
 */
export class KnowledgeFaqSource {
  public constructor(
    private readonly files: KnowledgeFileReader | Pick<AgentFileStorePort, 'read'>
  ) {}

  public async entries(
    input: Readonly<{ tenantId: string; agentId: string }>
  ): Promise<readonly FrontlineFaqEntry[]> {
    const file = await this.files.read({ ...input, path: faqPath });
    if (file === undefined) {
      return [];
    }

    const entries: FrontlineFaqEntry[] = [];
    let question: string | undefined;
    let answer: string[] = [];

    const flush = (): void => {
      const response = answer.join('\n').trim();
      if (question !== undefined && response.length > 0) {
        entries.push({ tenantId: input.tenantId, question, response });
      }
      answer = [];
    };

    for (const line of file.content.split(/\r?\n/)) {
      if (line.startsWith(headingPrefix)) {
        flush();
        question = line.slice(headingPrefix.length).trim();
        continue;
      }

      if (question !== undefined) {
        answer.push(line);
      }
    }
    flush();

    return entries;
  }
}
