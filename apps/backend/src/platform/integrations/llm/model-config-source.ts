import { z } from 'zod';
import type { LlmModelConfigSource, ActiveLlmModelConfig } from './llm-resolver.js';

const activeModelConfigRowsSchema = z.array(
  z.strictObject({
    role: z.enum(['classify', 'generate', 'complex', 'judge']),
    provider: z.string().min(1),
    api_kind: z.string().min(1),
    model_uri: z.string().min(1)
  })
);

export interface ModelConfigDatabase {
  execute(query: string, parameters: readonly string[]): Promise<unknown>;
}

export class DatabaseModelConfigSource implements LlmModelConfigSource {
  constructor(private readonly database: ModelConfigDatabase) {}

  async getActive(role: ActiveLlmModelConfig['role']): Promise<ActiveLlmModelConfig> {
    const rows = activeModelConfigRowsSchema.parse(
      await this.database.execute(
        'SELECT role, provider, api_kind, model_id AS model_uri FROM model_configs WHERE role = $1 AND active = true ORDER BY created_at DESC LIMIT 1',
        [role]
      )
    );
    const row = rows[0];
    if (!row) {
      throw new Error('Active model configuration not found');
    }

    return {
      role: row.role,
      provider: row.provider,
      apiKind: row.api_kind,
      modelUri: row.model_uri
    };
  }
}
