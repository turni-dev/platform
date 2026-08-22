import { z } from 'zod';

import type { PolicyLayer } from '../domain/policy-layer.js';
import type { CompiledSelectorPolicy } from '../domain/policy-rule-selector.js';

export const policyRowIdentitySchema = z.strictObject({
  tenantId: z.uuid(),
  agentId: z.uuid()
});

export type PolicyRowIdentity = z.infer<typeof policyRowIdentitySchema>;

export interface PolicyRow {
  readonly path: string;
  readonly layer: PolicyLayer;
  readonly compiled: CompiledSelectorPolicy;
}

/**
 * Write-side access to the `policies` table needed by provisioning.
 * `findByPath` lets the caller decide whether a row already exists (and
 * therefore must never be overwritten by a re-seed);  `insertIfAbsent`
 * performs the write and reports whether it actually inserted anything, so
 * the caller never needs a second round-trip to know.
 */
export interface PolicyWriterPort {
  findByPath(identity: PolicyRowIdentity, path: string): Promise<PolicyRow | undefined>;
  insertIfAbsent(identity: PolicyRowIdentity, row: PolicyRow): Promise<boolean>;
}

export interface PolicyProvisioningStatus {
  readonly version: string;
  readonly fingerprint: string;
}

/**
 * Tracks which "dimension" (version + content fingerprint, see
 * `domain/default-policy-set.ts`) of the shipped default policy set a
 * tenant/agent was last provisioned at.
 */
export interface PolicyProvisioningTrackerPort {
  getStatus(identity: PolicyRowIdentity): Promise<PolicyProvisioningStatus | undefined>;
  recordStatus(identity: PolicyRowIdentity, status: PolicyProvisioningStatus): Promise<void>;
}
