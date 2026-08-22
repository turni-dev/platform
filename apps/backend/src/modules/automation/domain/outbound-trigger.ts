export type TriggerStatus = 'active' | 'disabled';

/**
 * An outbound automation trigger (e.g. "check the calendar and remind the
 * guest"). Carries its own auto-disable guardrail: once it fails
 * `failureThreshold` times in a row it must stop firing on its own, without
 * waiting on an LLM decision — see {@link recordTriggerFailure}.
 */
export interface OutboundTrigger {
  readonly id: string;
  readonly tenantId: string;
  readonly status: TriggerStatus;
  readonly consecutiveFailures: number;
  readonly failureThreshold: number;
}

/** Tenant-level default when a trigger does not set its own threshold. */
export const DEFAULT_FAILURE_THRESHOLD = 3;

export interface CreateOutboundTriggerParams {
  readonly id: string;
  readonly tenantId: string;
  readonly failureThreshold?: number;
}

export function createOutboundTrigger(
  params: CreateOutboundTriggerParams
): OutboundTrigger {
  const failureThreshold = params.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  assertValidFailureThreshold(failureThreshold);

  return Object.freeze({
    id: params.id,
    tenantId: params.tenantId,
    status: 'active',
    consecutiveFailures: 0,
    failureThreshold
  });
}

export function assertValidFailureThreshold(failureThreshold: number): void {
  if (!Number.isInteger(failureThreshold) || failureThreshold < 1) {
    throw new Error('failureThreshold must be a positive integer');
  }
}
