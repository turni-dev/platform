import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type {
  LlmPort,
  LlmRequest,
  LlmResponse,
  StructuredLlmRequest
} from '../ports.js';
import { RedactingLlmPort, redactMessages } from '../pii-redaction.js';

const outputSchema = z.strictObject({
  reply: z.string(),
  contacts: z.array(z.strictObject({ value: z.string() }))
});

type Output = z.output<typeof outputSchema>;

class RecordingLlmPort implements LlmPort {
  public generateRequest: LlmRequest | undefined;
  public classifyRequest: LlmRequest | undefined;
  public nextOutput: Output = {
    reply: '[[TURNI_PII:EMAIL:1]]',
    contacts: [
      { value: '[[TURNI_PII:PHONE:2]]' },
      { value: '[[TURNI_PII:NAME:3]]' }
    ]
  };

  generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    this.generateRequest = request;
    return Promise.resolve({
      output: this.nextOutput as z.output<TSchema>,
      model: 'fake-model',
      usage: { inputTokens: 4, outputTokens: 5, cachedTokens: 2 }
    });
  }

  classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    this.classifyRequest = request;
    return Promise.resolve({
      output: this.nextOutput as z.output<TSchema>,
      model: 'fake-model',
      usage: { inputTokens: 4, outputTokens: 5, cachedTokens: 2 }
    });
  }
}

const request = {
  role: 'generate' as const,
  messages: [
    {
      role: 'user' as const,
      content:
        'Меня зовут Иван, пишите: ivan.petrov@example.ru или +7 (912) 345-67-89.'
    }
  ],
  outputSchema
};

describe('RedactingLlmPort', () => {
  it('uses a deterministic placeholder that cannot collide with message content', () => {
    const redaction = redactMessages([
      {
        role: 'user',
        content: 'Уже есть [[TURNI_PII:EMAIL:1]], мой адрес test@example.ru.'
      }
    ]);

    expect(redaction.messages[0]?.content).toBe(
      'Уже есть [[TURNI_PII:EMAIL:1]], мой адрес [[TURNI_PII:EMAIL:2]].'
    );
  });

  it('redacts deterministic email, Russian phone and explicit self-identification before generate', async () => {
    const delegate = new RecordingLlmPort();
    const port = new RedactingLlmPort(delegate);

    await port.generate(request);

    expect(delegate.generateRequest?.messages[0]?.content).toBe(
      'Меня зовут [[TURNI_PII:NAME:3]], пишите: [[TURNI_PII:EMAIL:1]] или [[TURNI_PII:PHONE:2]].'
    );
  });

  it('restores PII recursively in structured generate output and preserves metadata', async () => {
    const delegate = new RecordingLlmPort();
    const port = new RedactingLlmPort(delegate);

    const response = await port.generate(request);

    expect(response).toEqual({
      output: {
        reply: 'ivan.petrov@example.ru',
        contacts: [
          { value: '+7 (912) 345-67-89' },
          { value: 'Иван' }
        ]
      },
      model: 'fake-model',
      usage: { inputTokens: 4, outputTokens: 5, cachedTokens: 2 }
    });
  });

  it('redacts and restores PII through classify', async () => {
    const delegate = new RecordingLlmPort();
    const port = new RedactingLlmPort(delegate);

    const response = await port.classify({ ...request, role: 'classify' });

    expect(delegate.classifyRequest?.messages[0]?.content).toContain(
      '[[TURNI_PII:EMAIL:1]]'
    );
    expect(response.output.reply).toBe('ivan.petrov@example.ru');
  });

  it('fails closed without exposing PII for an absent, malformed or unknown placeholder', async () => {
    const outputs: Output[] = [
      { reply: 'Готово', contacts: [] },
      { reply: '[[TURNI_PII:EMAIL:99]]', contacts: [] },
      { reply: '[[TURNI_PII:EMAIL:1]', contacts: [] }
    ];

    for (const nextOutput of outputs) {
      const delegate = new RecordingLlmPort();
      delegate.nextOutput = nextOutput;
      const port = new RedactingLlmPort(delegate);

      await expect(port.generate(request)).rejects.toThrow(
        'Invalid redaction placeholder in LLM response.'
      );
    }
  });
});
