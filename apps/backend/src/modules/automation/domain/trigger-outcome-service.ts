import type { OutboundTrigger } from './outbound-trigger.js';

/**
 * Pure, deterministic decision applied after a trigger fires and fails.
 * Increments the consecutive-failure counter; once it reaches
 * `failureThreshold` the trigger is disabled on this same call (not one
 * failure later, not one failure sooner) so a broken trigger stops spamming
 * guests/owners and burning tokens without waiting on any LLM judgement.
 *
 * A trigger that is already disabled does not fire, so this is a no-op for
 * it: the decision is final once made.
 */
export function recordTriggerFailure(trigger: OutboundTrigger): OutboundTrigger {
  if (trigger.status === 'disabled') {
    return trigger;
  }

  const consecutiveFailures = trigger.consecutiveFailures + 1;
  const status = consecutiveFailures >= trigger.failureThreshold ? 'disabled' : 'active';

  return Object.freeze({
    ...trigger,
    consecutiveFailures,
    status
  });
}

/**
 * Pure, deterministic decision applied after a trigger fires successfully.
 * Resets the consecutive-failure streak to zero. Does not resurrect a
 * trigger that auto-disabled already — a disabled trigger no longer fires,
 * so it can never observe a success again; re-enabling it is a separate,
 * explicit owner action, not an implicit side effect of this function.
 */
export function recordTriggerSuccess(trigger: OutboundTrigger): OutboundTrigger {
  if (trigger.status === 'disabled' || trigger.consecutiveFailures === 0) {
    return trigger;
  }

  return Object.freeze({
    ...trigger,
    consecutiveFailures: 0
  });
}

export function canFire(trigger: OutboundTrigger): boolean {
  return trigger.status === 'active';
}
