import { describe, expect, it } from 'vitest';
import { createOutboundTrigger } from '../../domain/outbound-trigger.js';
import { FakeOutboundTriggerRepository } from '../fake-outbound-trigger-repository.js';
import {
  TriggerExecutionService,
  TriggerNotFoundError
} from '../trigger-execution-service.js';

const id = '01900000-0000-7000-8000-0000000000c1';
const tenantId = '01900000-0000-7000-8000-0000000000c2';

function repositoryWith(
  ...triggers: readonly ReturnType<typeof createOutboundTrigger>[]
): FakeOutboundTriggerRepository {
  const repository = new FakeOutboundTriggerRepository();
  for (const trigger of triggers) {
    repository.seed(trigger);
  }
  return repository;
}

describe('TriggerExecutionService', () => {
  it('persists the incremented failure count after a failed run', async () => {
    const repository = repositoryWith(
      createOutboundTrigger({ id, tenantId, failureThreshold: 3 })
    );
    const service = new TriggerExecutionService(repository);

    const result = await service.recordFailure(tenantId, id);

    expect(result.consecutiveFailures).toBe(1);
    expect(result.status).toBe('active');
    expect(await repository.findById(tenantId, id)).toEqual(result);
  });

  it('auto-disables and persists the disabled state on the Nth consecutive failure', async () => {
    const repository = repositoryWith(
      createOutboundTrigger({ id, tenantId, failureThreshold: 2 })
    );
    const service = new TriggerExecutionService(repository);

    await service.recordFailure(tenantId, id);
    const result = await service.recordFailure(tenantId, id);

    expect(result.status).toBe('disabled');
    expect(await repository.findById(tenantId, id)).toEqual(result);
  });

  it('resets the failure count and persists it after a successful run', async () => {
    const repository = repositoryWith(
      createOutboundTrigger({ id, tenantId, failureThreshold: 3 })
    );
    const service = new TriggerExecutionService(repository);
    await service.recordFailure(tenantId, id);

    const result = await service.recordSuccess(tenantId, id);

    expect(result.consecutiveFailures).toBe(0);
    expect(await repository.findById(tenantId, id)).toEqual(result);
  });

  it('rejects recording an outcome for a trigger that does not exist', async () => {
    const repository = new FakeOutboundTriggerRepository();
    const service = new TriggerExecutionService(repository);

    await expect(service.recordFailure(tenantId, id)).rejects.toBeInstanceOf(
      TriggerNotFoundError
    );
    await expect(service.recordSuccess(tenantId, id)).rejects.toBeInstanceOf(
      TriggerNotFoundError
    );
  });

  it('never fires an already disabled trigger', async () => {
    const repository = repositoryWith(
      createOutboundTrigger({ id, tenantId, failureThreshold: 1 })
    );
    const service = new TriggerExecutionService(repository);
    await service.recordFailure(tenantId, id); // disables it

    await expect(service.canFire(tenantId, id)).resolves.toBe(false);
  });
});
