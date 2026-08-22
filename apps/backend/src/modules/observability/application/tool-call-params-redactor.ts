import { redactMessages } from '@turni/llm';
import type { JsonValue } from '@turni/contracts';

/**
 * Redacts a single text field with the project's shared PII primitive
 * (`redactMessages` from `@turni/llm`, the same mechanism `RedactingLlmPort`
 * uses before any LLM call). Traces are write-only for future mining, so we
 * never need the restore side of that primitive — just the placeholder
 * substitution.
 */
export function redactToolCallText(text: string): string {
  const { messages } = redactMessages([{ role: 'user', content: text }]);
  return messages[0]?.content ?? text;
}

/**
 * Redacts every text leaf in a tool-call params object before it is
 * persisted. Non-text values (numbers, booleans, ids, enums, null) are
 * written as-is per the trace card's rule.
 */
export function redactToolCallParams(
  params: Record<string, JsonValue>
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, redactJsonValue(value)])
  );
}

function redactJsonValue(value: JsonValue): JsonValue {
  if (typeof value === 'string') return redactToolCallText(value);
  if (isJsonArray(value)) return value.map((item) => redactJsonValue(item));
  if (value !== null && typeof value === 'object') {
    const record: Record<string, JsonValue> = value;
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, redactJsonValue(item)])
    );
  }
  return value;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}
