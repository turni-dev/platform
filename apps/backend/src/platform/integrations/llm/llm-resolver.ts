import type {
  LlmPort,
  LlmResponse,
  LlmRole,
  StructuredLlmRequest
} from '@turni/llm';
import type { z } from 'zod';
import type { LlmPortRegistryPort } from './llm-port-registry.js';

export type ActiveLlmModelConfig = Readonly<{
  role: LlmRole;
  provider: string;
  modelUri: string;
  apiKind: string;
}>;

export interface LlmModelConfigSource {
  getActive(role: LlmRole): Promise<ActiveLlmModelConfig>;
}

export type { LlmPortRegistryPort as LlmPortRegistry } from './llm-port-registry.js';

export class LlmResolver implements LlmPort {
  constructor(
    private readonly configs: LlmModelConfigSource,
    private readonly adapters: LlmPortRegistryPort
  ) {}

  async generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    const adapter = await this.resolve(request.role);
    return adapter.generate(request);
  }

  async classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    const adapter = await this.resolve(request.role);
    return adapter.classify(request);
  }

  private async resolve(role: LlmRole): Promise<LlmPort> {
    const config = await this.configs.getActive(role);
    if (config.role !== role) {
      throw new Error('Model configuration role mismatch');
    }

    return this.adapters.get(config);
  }
}
