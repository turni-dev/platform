import type { AnswerPipeline } from '../../channels/application/inbound-message-service.js';
import type { CapabilityAutomationService } from './capability-automation-service.js';

/**
 * Wraps an ordinary `AnswerPipeline` (FAQ/policy driven text replies) with
 * the capability-registry automation path, without either side knowing about
 * the other. `InboundMessageService` (the VK/Telegram-agnostic inbound
 * pipeline) only ever sees the `AnswerPipeline` interface, so this decorator
 * is the entire integration point — no VK-specific or Google-specific code
 * lives in the agent/channel layer, per the card's "don't build a
 * vendor-specific path in the agent" constraint.
 *
 * A detected booking intent short-circuits the inner pipeline entirely: the
 * guest gets an immediate "passed to the owner" reply and nothing external
 * is written until an explicit approval decision happens out of band (see
 * the HTTP automation routes). Anything that is not a booking intent falls
 * through to `inner` unchanged.
 */
export class AutomationAnswerPipeline implements AnswerPipeline {
  public constructor(
    private readonly automations: CapabilityAutomationService,
    private readonly inner: AnswerPipeline
  ) {}

  public async handle(
    input: Parameters<AnswerPipeline['handle']>[0]
  ): ReturnType<AnswerPipeline['handle']> {
    const outcome = await this.automations.requestAutomation({
      tenantId: input.tenantId,
      channel: 'vk',
      guestRef: input.guestId,
      text: input.text,
      occurredAt: new Date(input.occurredAt)
    });

    if (outcome.verdict === 'pending_approval') {
      return { verdict: 'approval', response: outcome.response };
    }

    return this.inner.handle(input);
  }
}
