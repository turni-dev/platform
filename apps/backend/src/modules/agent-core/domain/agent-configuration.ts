/** MVP ships one agent per tenant, and it starts from the dining template. */
export const startingAgentTemplate = 'dining';

const maxAgentNameLength = 200;
const fallbackAgentName = 'Агент';

/** The workspace name is the owner's own word for their business, so the agent
 * carries it. `agents.name` is bounded, so a long one is cut rather than
 * refused: the owner renames it in the cabinet anyway. */
export function startingAgentName(tenantName: string): string {
  const trimmed = tenantName.trim().slice(0, maxAgentNameLength).trim();

  return trimmed.length === 0 ? fallbackAgentName : trimmed;
}

/**
 * The first `identity.md`. It is deliberately a skeleton in the owner's own
 * language: an empty file gives them nothing to react to, and a clever
 * generated persona would be a lie about a business we have not met.
 */
export function startingInstructions(tenantName: string): string {
  return [
    `# ${startingAgentName(tenantName)}`,
    '',
    '## Кто мы',
    'Опишите заведение в двух-трёх фразах: чем вы занимаетесь и для кого.',
    '',
    '## Как отвечаем гостям',
    'Тон общения, обращение на «вы» или на «ты», что уместно, а что нет.',
    '',
    '## Чего не делаем',
    'Темы и обещания, которых агент должен избегать.',
    ''
  ].join('\n');
}

export interface RevisionCandidate {
  readonly current?: Readonly<{ revision: number; content: string }>;
  readonly content: string;
}

/**
 * The revision a save should write, or nothing when the save changes nothing a
 * reader could see. Spending a revision on an identical body would fill the
 * owner's history with noise and make a real edit harder to find.
 */
export function nextRevision(candidate: RevisionCandidate): number | undefined {
  const current = candidate.current;
  if (current === undefined) {
    return 1;
  }

  return current.content.trim() === candidate.content.trim()
    ? undefined
    : current.revision + 1;
}
