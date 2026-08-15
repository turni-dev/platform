import type { JsonValue } from '@turni/contracts';
import {
  AnalyticsRecorder,
  type AnalyticsIdGeneratorPort
} from '../../reporting/application/analytics-recorder.js';
import type { DomainEventBus } from '../../reporting/application/domain-event-bus.port.js';

export const AgentConfigurationEventName = {
  Created: 'agent.created',
  InstructionsUpdated: 'agent.instructions_updated',
  KnowledgeUpdated: 'agent.knowledge_updated',
  KnowledgeDeleted: 'agent.knowledge_deleted',
  AutomationsUpdated: 'agent.automations_updated'
} as const;

export interface AgentEventContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly agentId: string;
  readonly at: Date;
}

/**
 * Records how an owner configures their agent. Props carry structure — ids,
 * paths, revision numbers, preset names — and never the markdown itself: the
 * files hold business data and can hold personal data.
 */
export class AgentConfigurationAnalytics {
  private readonly recorder: AnalyticsRecorder;

  public constructor(bus: DomainEventBus, ids: AnalyticsIdGeneratorPort) {
    this.recorder = new AnalyticsRecorder(bus, ids);
  }

  public async agentCreated(context: AgentEventContext): Promise<void> {
    await this.record(AgentConfigurationEventName.Created, context, {});
  }

  public async instructionsUpdated(
    context: AgentEventContext,
    revision: number
  ): Promise<void> {
    await this.record(AgentConfigurationEventName.InstructionsUpdated, context, {
      revision
    });
  }

  public async knowledgeUpdated(
    context: AgentEventContext,
    file: Readonly<{ path: string; revision: number }>
  ): Promise<void> {
    await this.record(AgentConfigurationEventName.KnowledgeUpdated, context, {
      path: file.path,
      revision: file.revision
    });
  }

  public async knowledgeDeleted(
    context: AgentEventContext,
    path: string
  ): Promise<void> {
    await this.record(AgentConfigurationEventName.KnowledgeDeleted, context, { path });
  }

  public async automationsUpdated(
    context: AgentEventContext,
    presets: readonly string[]
  ): Promise<void> {
    await this.record(AgentConfigurationEventName.AutomationsUpdated, context, {
      presets: [...presets]
    });
  }

  private async record(
    name: string,
    context: AgentEventContext,
    props: Record<string, JsonValue>
  ): Promise<void> {
    await this.recorder.record({
      name,
      tenantId: context.tenantId,
      actor: { type: 'owner', id: context.userId },
      props: { agentId: context.agentId, ...props },
      at: context.at
    });
  }
}
