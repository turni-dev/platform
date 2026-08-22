import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAILURE_THRESHOLD,
  createOutboundTrigger
} from '../outbound-trigger.js';

const id = '01900000-0000-7000-8000-0000000000a1';
const tenantId = '01900000-0000-7000-8000-0000000000a2';

describe('createOutboundTrigger', () => {
  it('starts active with a zero failure counter', () => {
    const trigger = createOutboundTrigger({ id, tenantId });

    expect(trigger).toEqual({
      id,
      tenantId,
      status: 'active',
      consecutiveFailures: 0,
      failureThreshold: DEFAULT_FAILURE_THRESHOLD
    });
  });

  it('accepts a per-trigger failure threshold override', () => {
    const trigger = createOutboundTrigger({ id, tenantId, failureThreshold: 5 });

    expect(trigger.failureThreshold).toBe(5);
  });

  it('rejects a non-positive failure threshold', () => {
    expect(() => createOutboundTrigger({ id, tenantId, failureThreshold: 0 })).toThrow();
    expect(() => createOutboundTrigger({ id, tenantId, failureThreshold: -1 })).toThrow();
  });

  it('rejects a fractional failure threshold', () => {
    expect(() => createOutboundTrigger({ id, tenantId, failureThreshold: 1.5 })).toThrow();
  });
});
