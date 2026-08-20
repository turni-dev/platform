import { describe, expect, it } from 'vitest';
import { SkillDefinitionSchema, SkillPublishInputSchema } from '../index.js';

describe('skill contracts', () => {
  it('accepts a published, active skill definition', () => {
    expect(
      SkillDefinitionSchema.parse({
        id: '018f2d15-7b34-7a20-8f49-b2f1a430e4d1',
        slug: 'calendar-write-event',
        version: 1,
        capabilityId: 'google.calendar.events.create',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: {} },
        permissions: ['calendar.events.write'],
        active: true,
        createdBy: '018f2d15-7b34-7a20-8f49-b2f1a430e4d2',
        createdAt: '2026-08-20T10:00:00Z'
      })
    ).toMatchObject({ slug: 'calendar-write-event', version: 1, active: true });
  });

  it('rejects an invalid permission scope', () => {
    expect(() =>
      SkillDefinitionSchema.parse({
        id: '018f2d15-7b34-7a20-8f49-b2f1a430e4d1',
        slug: 'calendar-write-event',
        version: 1,
        capabilityId: 'google.calendar.events.create',
        inputSchema: {},
        outputSchema: {},
        permissions: ['not a scope'],
        active: false,
        createdBy: null,
        createdAt: '2026-08-20T10:00:00Z'
      })
    ).toThrow();
  });

  it('rejects a publish input that tries to set version or active', () => {
    expect(() =>
      SkillPublishInputSchema.parse({
        slug: 'calendar-write-event',
        capabilityId: 'google.calendar.events.create',
        inputSchema: {},
        outputSchema: {},
        permissions: [],
        createdBy: null,
        version: 1
      })
    ).toThrow();
  });
});
