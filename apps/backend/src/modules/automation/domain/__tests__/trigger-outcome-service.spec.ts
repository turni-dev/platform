import { describe, expect, it } from 'vitest';
import { createOutboundTrigger } from '../outbound-trigger.js';
import { canFire, recordTriggerFailure, recordTriggerSuccess } from '../trigger-outcome-service.js';

const id = '01900000-0000-7000-8000-0000000000b1';
const tenantId = '01900000-0000-7000-8000-0000000000b2';

describe('recordTriggerFailure', () => {
  it('increments the consecutive failure counter and stays active below the threshold', () => {
    const trigger = createOutboundTrigger({ id, tenantId, failureThreshold: 3 });

    const afterOne = recordTriggerFailure(trigger);
    expect(afterOne.consecutiveFailures).toBe(1);
    expect(afterOne.status).toBe('active');

    const afterTwo = recordTriggerFailure(afterOne);
    expect(afterTwo.consecutiveFailures).toBe(2);
    expect(afterTwo.status).toBe('active');
  });

  it('auto-disables exactly on the Nth consecutive failure, not before', () => {
    const threshold = 3;
    let trigger = createOutboundTrigger({ id, tenantId, failureThreshold: threshold });

    trigger = recordTriggerFailure(trigger); // 1
    expect(trigger.status).toBe('active');
    trigger = recordTriggerFailure(trigger); // 2
    expect(trigger.status).toBe('active');
    trigger = recordTriggerFailure(trigger); // 3 == threshold
    expect(trigger.status).toBe('disabled');
    expect(trigger.consecutiveFailures).toBe(3);
  });

  it('does not keep incrementing or re-deciding once already disabled (final, deterministic)', () => {
    const threshold = 2;
    let trigger = createOutboundTrigger({ id, tenantId, failureThreshold: threshold });
    trigger = recordTriggerFailure(trigger); // 1
    trigger = recordTriggerFailure(trigger); // 2 -> disabled
    expect(trigger.status).toBe('disabled');

    const afterExtra = recordTriggerFailure(trigger);
    expect(afterExtra).toEqual(trigger);
    expect(afterExtra.consecutiveFailures).toBe(2);
  });

  it('threshold of 1 disables on the first failure', () => {
    const trigger = createOutboundTrigger({ id, tenantId, failureThreshold: 1 });
    const afterOne = recordTriggerFailure(trigger);

    expect(afterOne.status).toBe('disabled');
    expect(afterOne.consecutiveFailures).toBe(1);
  });
});

describe('recordTriggerSuccess', () => {
  it('resets the consecutive failure counter to zero', () => {
    const threshold = 5;
    let trigger = createOutboundTrigger({ id, tenantId, failureThreshold: threshold });
    trigger = recordTriggerFailure(trigger);
    trigger = recordTriggerFailure(trigger);
    expect(trigger.consecutiveFailures).toBe(2);

    const afterSuccess = recordTriggerSuccess(trigger);
    expect(afterSuccess.consecutiveFailures).toBe(0);
    expect(afterSuccess.status).toBe('active');
  });

  it('is a no-op when the counter is already zero', () => {
    const trigger = createOutboundTrigger({ id, tenantId });

    const afterSuccess = recordTriggerSuccess(trigger);
    expect(afterSuccess).toEqual(trigger);
  });

  it('does not resurrect an already disabled trigger', () => {
    const threshold = 1;
    let trigger = createOutboundTrigger({ id, tenantId, failureThreshold: threshold });
    trigger = recordTriggerFailure(trigger); // disabled
    expect(trigger.status).toBe('disabled');

    const afterSuccess = recordTriggerSuccess(trigger);
    expect(afterSuccess).toEqual(trigger);
    expect(afterSuccess.status).toBe('disabled');
  });
});

describe('canFire', () => {
  it('is true only for active triggers', () => {
    const active = createOutboundTrigger({ id, tenantId });
    expect(canFire(active)).toBe(true);

    const threshold = 1;
    const disabled = recordTriggerFailure(
      createOutboundTrigger({ id, tenantId, failureThreshold: threshold })
    );
    expect(canFire(disabled)).toBe(false);
  });
});
