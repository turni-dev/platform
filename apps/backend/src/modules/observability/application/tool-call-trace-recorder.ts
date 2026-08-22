import type { EventActor, JsonValue } from '@turni/contracts';
import type { DomainEventBus } from '../../reporting/application/domain-event-bus.port.js';
import { addCost, zeroCost, type ToolCallCost } from '../domain/tool-call-cost.js';
import {
  ToolCallTraceSchema,
  type ToolCallOutcome
} from '../domain/tool-call-trace.js';
import { redactToolCallParams, redactToolCallText } from './tool-call-params-redactor.js';

export interface ToolCallIdGeneratorPort {
  next(): string;
}

export interface RawToolCall {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actor: EventActor;
  readonly toolName: string;
  readonly params: Record<string, JsonValue>;
  readonly outcome: ToolCallOutcome;
  readonly errorMessage?: string;
  readonly cost: ToolCallCost;
  readonly occurredAt: Date;
}

interface RunTotals {
  readonly callCount: number;
  readonly cost: ToolCallCost;
}

/**
 * Records one mineable trace per tool call: sequence within the run
 * (doubling as the accumulated call count), redacted params, outcome,
 * per-call and cumulative cost, and the run's correlationId.
 *
 * Reuses the shared `events` envelope/table (see
 * reporting/application/domain-event-bus.port) instead of a parallel trace
 * store: tool-call traces are analytics facts at the same write frequency
 * and the same tenant-scoped retention as other domain events already
 * flowing through that table (see faq-chat-pipeline's `risk.assessed` /
 * `frontline.answered` events), so a second table would only duplicate
 * infra the "Event bus + таблица events" card already built.
 *
 * Publishing is best-effort like AnalyticsRecorder: a broken envelope or an
 * unreachable table must never block the tool call it describes. Run
 * counters still advance on a publish failure so sequence/cost stay
 * consistent with how many calls actually happened, even if that one trace
 * never made it to storage.
 */
export class ToolCallTraceRecorder {
  private readonly totalsByRun = new Map<string, RunTotals>();

  public constructor(
    private readonly bus: DomainEventBus,
    private readonly ids: ToolCallIdGeneratorPort
  ) {}

  public async record(call: RawToolCall): Promise<void> {
    const previous = this.totalsByRun.get(call.correlationId) ?? {
      callCount: 0,
      cost: zeroCost(call.cost.currency)
    };
    const totals: RunTotals = {
      callCount: previous.callCount + 1,
      cost: addCost(previous.cost, call.cost)
    };
    this.totalsByRun.set(call.correlationId, totals);

    try {
      const trace = ToolCallTraceSchema.parse({
        id: this.ids.next(),
        tenantId: call.tenantId,
        correlationId: call.correlationId,
        sequence: totals.callCount,
        toolName: call.toolName,
        params: redactToolCallParams(call.params),
        outcome: call.outcome,
        ...(call.errorMessage === undefined
          ? {}
          : { errorMessage: redactToolCallText(call.errorMessage) }),
        cost: call.cost,
        cumulativeCost: totals.cost,
        occurredAt: call.occurredAt.toISOString()
      });

      await this.bus.publish({
        id: trace.id,
        tenantId: trace.tenantId,
        name: 'agent.tool_call.recorded',
        version: 1,
        actor: call.actor,
        correlationId: trace.correlationId,
        props: {
          sequence: trace.sequence,
          toolName: trace.toolName,
          params: trace.params,
          outcome: trace.outcome,
          ...(trace.errorMessage === undefined ? {} : { errorMessage: trace.errorMessage }),
          cost: { amount: trace.cost.amount, currency: trace.cost.currency },
          cumulativeCost: {
            amount: trace.cumulativeCost.amount,
            currency: trace.cumulativeCost.currency
          }
        },
        createdAt: trace.occurredAt
      });
    } catch (error) {
      console.error('tool call trace dropped', { toolName: call.toolName, error });
    }
  }
}
