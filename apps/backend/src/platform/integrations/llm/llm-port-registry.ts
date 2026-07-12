import type { LlmPort } from '@turni/llm';
import type { ActiveLlmModelConfig } from './llm-resolver.js';

export type LlmAdapterRegistration = Readonly<{
  provider: string;
  apiKind: string;
  create: (config: ActiveLlmModelConfig) => LlmPort;
}>;

export interface LlmPortRegistryPort {
  get(config: ActiveLlmModelConfig): LlmPort;
}

export class LlmPortRegistry implements LlmPortRegistryPort {
  private readonly registrations: readonly LlmAdapterRegistration[];

  constructor(registrations: readonly LlmAdapterRegistration[]) {
    this.registrations = registrations;
  }

  get(config: ActiveLlmModelConfig): LlmPort {
    const registration = this.registrations.find(
      (candidate) =>
        candidate.provider === config.provider && candidate.apiKind === config.apiKind
    );
    if (!registration) {
      throw new Error('No LLM adapter is registered for this provider and API kind');
    }

    return registration.create(config);
  }
}
