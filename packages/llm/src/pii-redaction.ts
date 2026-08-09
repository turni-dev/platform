import type { z } from 'zod';
import type {
  LlmMessage,
  LlmPort,
  LlmResponse,
  StructuredLlmRequest
} from './ports.js';

type PiiKind = 'EMAIL' | 'PHONE' | 'NAME';

interface RedactionEntry {
  placeholder: string;
  value: string;
}

interface SensitiveMatch {
  kind: PiiKind;
  start: number;
  value: string;
}

const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu;
const phonePattern = /(?<!\d)(?:\+7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/gu;
const selfIdentifiedNamePattern =
  /(?<!\p{L})(?:меня\s+зовут|мо[её]\s+имя\s*(?:—|-|:)?|я)\s+([А-ЯЁ][а-яё-]{1,})/giu;
const validPlaceholderPattern = /\[\[TURNI_PII:(?:EMAIL|PHONE|NAME):\d+\]\]/gu;
const placeholderPrefix = '[[TURNI_PII';
const invalidPlaceholderMessage = 'Invalid redaction placeholder in LLM response.';

export class RedactingLlmPort implements LlmPort {
  public constructor(private readonly delegate: LlmPort) {}

  public async generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    const redaction = redactMessages(request.messages);
    const response = await this.delegate.generate({ ...request, messages: redaction.messages });

    return restoreResponse(response, redaction.entries);
  }

  public async classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    const redaction = redactMessages(request.messages);
    const response = await this.delegate.classify({ ...request, messages: redaction.messages });

    return restoreResponse(response, redaction.entries);
  }
}

export function redactMessages(messages: readonly LlmMessage[]): {
  messages: LlmMessage[];
  entries: readonly RedactionEntry[];
} {
  const reservedText = messages.map((message) => message.content);
  const entriesByValue = new Map<string, RedactionEntry>();
  let placeholderNumber = 1;

  for (const kind of ['EMAIL', 'PHONE', 'NAME'] as const) {
    for (const message of messages) {
      for (const match of findSensitiveMatches(message.content, kind)) {
        const key = `${kind}\u0000${match.value}`;
        if (entriesByValue.has(key)) continue;

        let placeholder = `[[TURNI_PII:${kind}:${placeholderNumber}]]`;
        while (reservedText.some((content) => content.includes(placeholder))) {
          placeholderNumber += 1;
          placeholder = `[[TURNI_PII:${kind}:${placeholderNumber}]]`;
        }
        entriesByValue.set(key, { placeholder, value: match.value });
        placeholderNumber += 1;
      }
    }
  }

  return {
    messages: messages.map((message) => ({
      ...message,
      content: replaceSensitiveValues(message.content, entriesByValue)
    })),
    entries: [...entriesByValue.values()]
  };
}

function findSensitiveMatches(content: string, kind: PiiKind): SensitiveMatch[] {
  if (kind === 'NAME') {
    return [...content.matchAll(selfIdentifiedNamePattern)].flatMap((match) => {
      const value = match[1];
      if (value === undefined || match.index === undefined) return [];
      return [{ kind, start: match.index + match[0].length - value.length, value }];
    });
  }

  const pattern = kind === 'EMAIL' ? emailPattern : phonePattern;
  return [...content.matchAll(pattern)].flatMap((match) => {
    if (match.index === undefined) return [];
    return [{ kind, start: match.index, value: match[0] }];
  });
}

function replaceSensitiveValues(
  content: string,
  entriesByValue: ReadonlyMap<string, RedactionEntry>
): string {
  const matches = (['EMAIL', 'PHONE', 'NAME'] as const)
    .flatMap((kind) => findSensitiveMatches(content, kind))
    .sort((left, right) => right.start - left.start);

  let redacted = content;
  for (const match of matches) {
    const entry = entriesByValue.get(`${match.kind}\u0000${match.value}`);
    if (entry === undefined) continue;
    redacted =
      redacted.slice(0, match.start) +
      entry.placeholder +
      redacted.slice(match.start + match.value.length);
  }
  return redacted;
}

function restoreResponse<TOutput>(
  response: LlmResponse<TOutput>,
  entries: readonly RedactionEntry[]
): LlmResponse<TOutput> {
  const entriesByPlaceholder = new Map(
    entries.map((entry) => [entry.placeholder, entry] as const)
  );
  const seen = new Set<string>();
  const output = restoreValue(response.output, entriesByPlaceholder, seen);

  if (seen.size !== entriesByPlaceholder.size) {
    throw new Error(invalidPlaceholderMessage);
  }

  return { ...response, output };
}

function restoreValue<T>(
  value: T,
  entriesByPlaceholder: ReadonlyMap<string, RedactionEntry>,
  seen: Set<string>
): T {
  if (typeof value === 'string') {
    const restored = value.replace(validPlaceholderPattern, (placeholder) => {
      const entry = entriesByPlaceholder.get(placeholder);
      if (entry === undefined) throw new Error(invalidPlaceholderMessage);
      seen.add(placeholder);
      return entry.value;
    });
    if (restored.includes(placeholderPrefix)) throw new Error(invalidPlaceholderMessage);
    return restored as T;
  }
  if (Array.isArray(value)) {
    const values: unknown[] = value;
    return values.map((item) => restoreValue(item, entriesByPlaceholder, seen)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        restoreValue(item, entriesByPlaceholder, seen)
      ])
    ) as T;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
