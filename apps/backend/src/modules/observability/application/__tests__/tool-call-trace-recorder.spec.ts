import { describe, expect, it } from 'vitest';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import type { DomainEventBus } from '../../../reporting/application/domain-event-bus.port.js';
import { ToolCallTraceRecorder, type RawToolCall } from '../tool-call-trace-recorder.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const correlationId = '01900000-0000-7000-8000-000000000002';
const occurredAt = new Date('2026-08-22T10:00:00.000Z');

function build(bus: DomainEventBus): ToolCallTraceRecorder {
  let sequence = 0;
  return new ToolCallTraceRecorder(bus, {
    next: () => {
      sequence += 1;
      return `01900000-0000-7000-8000-00000000010${sequence}`;
    }
  });
}

function call(overrides: Partial<RawToolCall> = {}): RawToolCall {
  return {
    tenantId,
    correlationId,
    actor: { type: 'agent' },
    toolName: 'search_menu',
    params: { query: 'stub' },
    outcome: 'success',
    cost: { amount: '0.10', currency: 'RUB' },
    occurredAt,
    ...overrides
  };
}

describe('ToolCallTraceRecorder', () => {
  it('publishes a redacted trace as a domain event on the shared events envelope', async () => {
    const bus = new FakeDomainEventBus();
    await build(bus).record(
      call({ params: { note: 'пишите на guest@example.com', limit: 5 } })
    );

    expect(bus.publishedEvents).toHaveLength(1);
    const [event] = bus.publishedEvents;
    expect(event?.name).toBe('agent.tool_call.recorded');
    expect(event?.tenantId).toBe(tenantId);
    expect(event?.correlationId).toBe(correlationId);
    expect(event?.props).toMatchObject({
      sequence: 1,
      toolName: 'search_menu',
      params: { note: 'пишите на [[TURNI_PII:EMAIL:1]]', limit: 5 },
      outcome: 'success',
      cost: { amount: '0.10', currency: 'RUB' },
      cumulativeCost: { amount: '0.10', currency: 'RUB' }
    });
  });

  it('leaves non-text params untouched while redacting text ones', async () => {
    const bus = new FakeDomainEventBus();
    await build(bus).record(call({ params: { table: 12, vip: true, note: null } }));

    expect(bus.publishedEvents[0]?.props['params']).toEqual({
      table: 12,
      vip: true,
      note: null
    });
  });

  it('increases sequence monotonically within a run and resets for a new run', async () => {
    const bus = new FakeDomainEventBus();
    const recorder = build(bus);

    await recorder.record(call());
    await recorder.record(call());
    await recorder.record(call({ correlationId: '01900000-0000-7000-8000-000000000099' }));
    await recorder.record(call());

    const sequences = bus.publishedEvents.map((event) => event.props['sequence']);
    expect(sequences).toEqual([1, 2, 1, 3]);
  });

  it('aggregates cost across calls in the same run', async () => {
    const bus = new FakeDomainEventBus();
    const recorder = build(bus);

    await recorder.record(call({ cost: { amount: '0.10', currency: 'RUB' } }));
    await recorder.record(call({ cost: { amount: '0.25', currency: 'RUB' } }));
    await recorder.record(call({ cost: { amount: '0.05', currency: 'RUB' } }));

    const cumulative = bus.publishedEvents.map((event) => event.props['cumulativeCost']);
    expect(cumulative).toEqual([
      { amount: '0.10', currency: 'RUB' },
      { amount: '0.35', currency: 'RUB' },
      { amount: '0.40', currency: 'RUB' }
    ]);
  });

  it('threads the run correlationId through every trace in the run', async () => {
    const bus = new FakeDomainEventBus();
    const recorder = build(bus);

    await recorder.record(call());
    await recorder.record(call());

    expect(bus.publishedEvents.map((event) => event.correlationId)).toEqual([
      correlationId,
      correlationId
    ]);
  });

  it('records a failed call outcome with a redacted error message', async () => {
    const bus = new FakeDomainEventBus();
    await build(bus).record(
      call({ outcome: 'error', errorMessage: 'timeout for guest@example.com' })
    );

    expect(bus.publishedEvents[0]?.props).toMatchObject({
      outcome: 'error',
      errorMessage: 'timeout for [[TURNI_PII:EMAIL:1]]'
    });
  });

  it('never lets a failed publish reach the caller (best-effort like AnalyticsRecorder)', async () => {
    const failing: DomainEventBus = {
      publish: () => Promise.reject(new Error('events table unavailable'))
    };

    await expect(build(failing).record(call())).resolves.toBeUndefined();
  });
});
