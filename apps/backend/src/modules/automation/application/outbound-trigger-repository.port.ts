import type { OutboundTrigger } from '../domain/outbound-trigger.js';

/** Port for loading and persisting outbound trigger state, tenant-scoped. */
export interface OutboundTriggerRepositoryPort {
  findById(tenantId: string, id: string): Promise<OutboundTrigger | undefined>;
  save(trigger: OutboundTrigger): Promise<void>;
}
