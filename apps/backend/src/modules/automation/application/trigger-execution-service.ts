import { canFire, recordTriggerFailure, recordTriggerSuccess } from '../domain/trigger-outcome-service.js';
import type { OutboundTrigger } from '../domain/outbound-trigger.js';
import type { OutboundTriggerRepositoryPort } from './outbound-trigger-repository.port.js';

export class TriggerNotFoundError extends Error {
  public constructor(id: string) {
    super(`No outbound trigger ${id} exists for this tenant`);
    this.name = 'TriggerNotFoundError';
  }
}

/**
 * Wires the pure trigger-outcome decision (see domain/trigger-outcome-service)
 * to persistence: load the current state, apply the deterministic decision,
 * persist the result. Callers report a fired trigger's outcome here; the
 * auto-disable decision itself lives entirely in the domain layer.
 */
export class TriggerExecutionService {
  public constructor(private readonly repository: OutboundTriggerRepositoryPort) {}

  public async recordFailure(tenantId: string, id: string): Promise<OutboundTrigger> {
    const trigger = await this.load(tenantId, id);
    const next = recordTriggerFailure(trigger);
    await this.repository.save(next);
    return next;
  }

  public async recordSuccess(tenantId: string, id: string): Promise<OutboundTrigger> {
    const trigger = await this.load(tenantId, id);
    const next = recordTriggerSuccess(trigger);
    await this.repository.save(next);
    return next;
  }

  public async canFire(tenantId: string, id: string): Promise<boolean> {
    const trigger = await this.load(tenantId, id);
    return canFire(trigger);
  }

  private async load(tenantId: string, id: string): Promise<OutboundTrigger> {
    const trigger = await this.repository.findById(tenantId, id);
    if (trigger === undefined) {
      throw new TriggerNotFoundError(id);
    }
    return trigger;
  }
}
