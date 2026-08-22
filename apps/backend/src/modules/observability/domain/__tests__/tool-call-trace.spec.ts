import { describe, expect, it } from 'vitest';
import { ToolCallTraceSchema } from '../tool-call-trace.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const correlationId = '01900000-0000-7000-8000-000000000002';

function validTrace(overrides: Record<string, unknown> = {}) {
  return {
    id: '01900000-0000-7000-8000-000000000003',
    tenantId,
    correlationId,
    sequence: 1,
    toolName: 'search_menu',
    params: { query: 'позвоните мне на +7 999 123 45 67', limit: 5 },
    outcome: 'success',
    cost: { amount: '0.20', currency: 'RUB' },
    cumulativeCost: { amount: '0.20', currency: 'RUB' },
    occurredAt: '2026-08-22T10:00:00.000Z',
    ...overrides
  };
}

describe('ToolCallTraceSchema', () => {
  it('accepts a well-formed trace record', () => {
    expect(() => ToolCallTraceSchema.parse(validTrace())).not.toThrow();
  });

  it('accepts a non-text param (number/enum/id) as-is', () => {
    const parsed = ToolCallTraceSchema.parse(validTrace({ params: { limit: 5, active: true } }));
    expect(parsed.params).toEqual({ limit: 5, active: true });
  });

  it('accepts an optional error message on a failed call', () => {
    const parsed = ToolCallTraceSchema.parse(
      validTrace({ outcome: 'error', errorMessage: 'timeout' })
    );
    expect(parsed.errorMessage).toBe('timeout');
  });

  it('rejects an unknown outcome', () => {
    expect(() => ToolCallTraceSchema.parse(validTrace({ outcome: 'maybe' }))).toThrow();
  });

  it('rejects a non-positive sequence number', () => {
    expect(() => ToolCallTraceSchema.parse(validTrace({ sequence: 0 }))).toThrow();
  });

  it('rejects a malformed cost amount', () => {
    expect(() =>
      ToolCallTraceSchema.parse(validTrace({ cost: { amount: '0.2', currency: 'RUB' } }))
    ).toThrow();
  });

  it('rejects unknown top-level fields', () => {
    expect(() => ToolCallTraceSchema.parse(validTrace({ extra: 'nope' }))).toThrow();
  });
});
