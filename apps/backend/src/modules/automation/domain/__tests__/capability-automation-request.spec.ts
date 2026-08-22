import { describe, expect, it } from 'vitest';
import {
  isFullyExecuted,
  isTerminal,
  type CapabilityAutomationRequest
} from '../capability-automation-request.js';

const base: CapabilityAutomationRequest = {
  id: '01900000-0000-7000-8000-000000000001',
  tenantId: '01900000-0000-7000-8000-000000000002',
  agentId: '01900000-0000-7000-8000-000000000003',
  connectionId: '01900000-0000-7000-8000-000000000004',
  channel: 'vk',
  guestRef: 'vk:123',
  idempotencyKey: 'key-1',
  status: 'pending_approval',
  calendarInput: {
    summary: 'test',
    startsAt: '2026-08-22T18:00:00.000Z',
    endsAt: '2026-08-22T19:00:00.000Z'
  },
  calendarEventId: undefined,
  sheetsAppended: false,
  decidedBy: undefined,
  decidedAt: undefined,
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T10:00:00.000Z'
};

describe('isTerminal', () => {
  it('treats rejected and executed as terminal', () => {
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('executed')).toBe(true);
  });

  it('treats every in-flight status as non-terminal', () => {
    expect(isTerminal('pending_approval')).toBe(false);
    expect(isTerminal('approved')).toBe(false);
    expect(isTerminal('executing')).toBe(false);
    expect(isTerminal('failed')).toBe(false);
  });
});

describe('isFullyExecuted', () => {
  it('is false until both writes have happened', () => {
    expect(isFullyExecuted(base)).toBe(false);
    expect(isFullyExecuted({ ...base, calendarEventId: 'evt-1' })).toBe(false);
    expect(isFullyExecuted({ ...base, sheetsAppended: true })).toBe(false);
  });

  it('is true only once the calendar event exists and the sheet row was appended', () => {
    expect(isFullyExecuted({ ...base, calendarEventId: 'evt-1', sheetsAppended: true })).toBe(
      true
    );
  });
});
