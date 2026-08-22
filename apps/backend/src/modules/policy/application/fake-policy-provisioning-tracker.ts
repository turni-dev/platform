import type {
  PolicyProvisioningStatus,
  PolicyProvisioningTrackerPort,
  PolicyRowIdentity
} from './policy-provisioning.port.js';

function keyOf(identity: PolicyRowIdentity): string {
  return `${identity.tenantId}:${identity.agentId}`;
}

/** In-memory double for {@link PolicyProvisioningTrackerPort}. */
export class FakePolicyProvisioningTracker implements PolicyProvisioningTrackerPort {
  private readonly statuses = new Map<string, PolicyProvisioningStatus>();

  public getStatus(identity: PolicyRowIdentity): Promise<PolicyProvisioningStatus | undefined> {
    return Promise.resolve(this.statuses.get(keyOf(identity)));
  }

  public recordStatus(identity: PolicyRowIdentity, status: PolicyProvisioningStatus): Promise<void> {
    this.statuses.set(keyOf(identity), status);
    return Promise.resolve();
  }
}
