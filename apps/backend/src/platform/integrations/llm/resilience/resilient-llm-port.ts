import type {
  LlmPort,
  LlmResponse,
  StructuredLlmRequest
} from '@turni/llm';
import type { z } from 'zod';
import type { LlmResilience } from './llm-resilience.js';

export class ResilientLlmPort implements LlmPort {
  constructor(
    private readonly delegate: LlmPort,
    private readonly circuitKey: string,
    private readonly resilience: LlmResilience
  ) {}

  generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    return this.resilience.execute(this.circuitKey, () =>
      this.delegate.generate(request)
    );
  }

  classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    return this.resilience.execute(this.circuitKey, () =>
      this.delegate.classify(request)
    );
  }
}
