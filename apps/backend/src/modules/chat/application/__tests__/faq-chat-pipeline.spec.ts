import { describe, expect, it } from 'vitest';
import type { PolicyOutcome } from '../../../policy/domain/policy-engine.js';
import { FaqChatPipeline } from '../faq-chat-pipeline.js';

const ids = {
  tenantId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19f',
  guestId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19e',
  eventId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a0',
  correlationId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a1'
};

const auto: PolicyOutcome = { verdict: 'auto', riskScore: 1, locked: false, rule: 'safe' };

describe('FaqChatPipeline', () => {
  it('evaluates policy before exact FAQ and publishes metadata-only answer event', async () => {
    const published: unknown[] = [];
    const pipeline = new FaqChatPipeline(
      { evaluate: () => Promise.resolve(auto) },
      { answer: () => ({ verdict: 'auto', response: 'Работаем до 22:00.' }) },
      { publish: (event) => { published.push(event); return Promise.resolve(); } }
    );

    const result = await pipeline.handle({ ...ids, occurredAt: '2026-08-09T10:00:00.000Z', text: 'Часы работы?' });

    expect(result).toEqual({ verdict: 'auto', response: 'Работаем до 22:00.' });
    expect(published).toEqual([{ id: ids.eventId, tenantId: ids.tenantId, name: 'frontline.answered', version: 1, actor: { type: 'guest', id: ids.guestId }, correlationId: ids.correlationId, props: { policyVerdict: 'auto', riskScore: 1, rule: 'safe' }, createdAt: '2026-08-09T10:00:00.000Z' }]);
    expect(JSON.stringify(published)).not.toContain('Часы работы?');
  });

  it('hands off non-auto policy decisions without querying FrontLine', async () => {
    let frontlineCalls = 0;
    const pipeline = new FaqChatPipeline(
      { evaluate: () => Promise.resolve({ ...auto, verdict: 'approval' as const }) },
      { answer: () => { frontlineCalls += 1; return { verdict: 'auto', response: 'no' }; } },
      { publish: () => Promise.resolve() }
    );

    await expect(pipeline.handle({ ...ids, occurredAt: '2026-08-09T10:00:00.000Z', text: 'Оплата?' })).resolves.toEqual({ verdict: 'approval', response: 'Передам ваш вопрос администратору.' });
    expect(frontlineCalls).toBe(0);
  });

  it('hands off unknown FAQs and marks the event as out of knowledge base', async () => {
    const published: unknown[] = [];
    const pipeline = new FaqChatPipeline(
      { evaluate: () => Promise.resolve(auto) },
      { answer: () => ({ verdict: 'out_of_kb' }) },
      { publish: (event) => { published.push(event); return Promise.resolve(); } }
    );

    await expect(pipeline.handle({ ...ids, occurredAt: '2026-08-09T10:00:00.000Z', text: 'Неизвестный вопрос' })).resolves.toEqual({ verdict: 'out_of_kb', response: 'Передам ваш вопрос администратору.' });
    expect((published[0] as { name: string }).name).toBe('frontline.out_of_kb');
  });
});
