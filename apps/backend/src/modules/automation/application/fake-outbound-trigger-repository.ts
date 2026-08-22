import type { OutboundTrigger } from '../domain/outbound-trigger.js';
import type { OutboundTriggerRepositoryPort } from './outbound-trigger-repository.port.js';

function key(tenantId: string, id: string): string {
  return `${tenantId}:${id}`;
}

export class FakeOutboundTriggerRepository implements OutboundTriggerRepositoryPort {
  public readonly saved: OutboundTrigger[] = [];

  private readonly triggers = new Map<string, OutboundTrigger>();

  public seed(trigger: OutboundTrigger): void {
    this.triggers.set(key(trigger.tenantId, trigger.id), trigger);
  }

  public findById(tenantId: string, id: string): Promise<OutboundTrigger | undefined> {
    return Promise.resolve(this.triggers.get(key(tenantId, id)));
  }

  public save(trigger: OutboundTrigger): Promise<void> {
    this.triggers.set(key(trigger.tenantId, trigger.id), trigger);
    this.saved.push(trigger);
    return Promise.resolve();
  }
}
