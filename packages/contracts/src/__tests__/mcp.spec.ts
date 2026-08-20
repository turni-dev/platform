import { describe, expect, it } from 'vitest';
import { McpCapabilitySchema, McpInvocationSchema } from '../index.js';

describe('MCP contracts', () => {
  it('accepts a named write capability', () => {
    expect(
      McpCapabilitySchema.parse({
        id: 'google.calendar.events.create',
        providerSlug: 'google',
        operation: 'write'
      })
    ).toEqual({
      id: 'google.calendar.events.create',
      providerSlug: 'google',
      operation: 'write'
    });
  });

  it('rejects an invalid capability operation', () => {
    expect(() =>
      McpCapabilitySchema.parse({
        id: 'google.calendar.events.create',
        providerSlug: 'google',
        operation: 'execute'
      })
    ).toThrow();
  });

  it('accepts only JSON-compatible invocation input', () => {
    expect(
      McpInvocationSchema.parse({
        connectionId: '018f2d15-7b34-7a20-8f49-b2f1a430e4d1',
        capabilityId: 'google.sheets.rows.append',
        input: { range: 'Audit!A:C', values: ['created', '42'] }
      })
    ).toMatchObject({ capabilityId: 'google.sheets.rows.append' });
  });
});
