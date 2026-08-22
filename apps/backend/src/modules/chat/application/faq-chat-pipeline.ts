import { z } from 'zod';
import type { DomainEventBus } from '../../reporting/application/domain-event-bus.port.js';
import type { FrontlineWorkflow } from '../../frontline/application/frontline-workflow.js';
import type { PolicyInput, PolicyOutcome, PolicyVerdict } from '../../policy/domain/policy-engine.js';
import type { EchoAgentPort } from './echo-agent.js';

const SAFE_HANDOFF = 'Передам ваш вопрос администратору.';

const FaqChatInputSchema = z.strictObject({
  tenantId: z.uuidv7(),
  guestId: z.uuidv7(),
  eventId: z.uuidv7(),
  correlationId: z.uuidv7(),
  occurredAt: z.iso.datetime(),
  text: z.string().min(1)
});

export interface FaqChatInput {
  readonly tenantId: string;
  readonly guestId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly text: string;
}

export type FaqChatResult = Readonly<{ verdict: PolicyVerdict; response: string }>;

interface PolicyEvaluator {
  evaluate(input: PolicyInput): Promise<PolicyOutcome>;
}

type FrontlinePort = Pick<FrontlineWorkflow, 'answer'>;

export class FaqChatPipeline {
  public constructor(
    private readonly policy: PolicyEvaluator,
    private readonly frontline: FrontlinePort,
    private readonly events: DomainEventBus,
    private readonly echoAgent: EchoAgentPort
  ) {}

  public async handle(input: FaqChatInput): Promise<FaqChatResult> {
    const parsed = FaqChatInputSchema.parse(input);
    const policy = await this.policy.evaluate({ text: parsed.text });

    // Policy runs before FrontLine is even consulted: a non-auto verdict
    // (deny/approval/escalate) never reaches the FAQ dictionary or the echo
    // agent, and the reply never echoes the guest's own text back to them —
    // this is the boundary a policy-bypass attempt must not cross.
    if (policy.verdict !== 'auto') {
      await this.publish(parsed, 'risk.assessed', policy);
      return { verdict: policy.verdict, response: SAFE_HANDOFF };
    }

    const frontline = this.frontline.answer({ tenantId: parsed.tenantId, question: parsed.text });
    if (frontline.verdict === 'auto') {
      await this.publish(parsed, 'frontline.answered', policy);
      return frontline;
    }

    await this.publish(parsed, 'frontline.out_of_kb', policy);
    return { verdict: 'out_of_kb', response: this.echoAgent.reply({ text: parsed.text }) };
  }

  private async publish(
    input: z.output<typeof FaqChatInputSchema>,
    name: 'frontline.answered' | 'frontline.out_of_kb' | 'risk.assessed',
    policy: PolicyOutcome
  ): Promise<void> {
    await this.events.publish({
      id: input.eventId,
      tenantId: input.tenantId,
      name,
      version: 1,
      actor: { type: 'guest', id: input.guestId },
      correlationId: input.correlationId,
      props: { policyVerdict: policy.verdict, riskScore: policy.riskScore, rule: policy.rule },
      createdAt: input.occurredAt
    });
  }
}
