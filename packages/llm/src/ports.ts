import { z } from 'zod';

export const LlmRoleSchema = z.enum([
  'classify',
  'generate',
  'complex',
  'judge'
]);
export const LlmMessageSchema = z.strictObject({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1)
});
export const LlmRequestSchema = z.strictObject({
  role: LlmRoleSchema,
  messages: z.array(LlmMessageSchema).min(1),
  correlationId: z.uuid().optional()
});
export const LlmUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().default(0)
});

export type LlmRole = z.infer<typeof LlmRoleSchema>;
export type LlmMessage = z.infer<typeof LlmMessageSchema>;
export type LlmRequest = z.infer<typeof LlmRequestSchema>;
export type LlmUsage = z.infer<typeof LlmUsageSchema>;

export type StructuredLlmRequest<TSchema extends z.ZodType> = LlmRequest & {
  outputSchema: TSchema;
};

export interface LlmResponse<TOutput> {
  output: TOutput;
  model: string;
  usage: LlmUsage;
}

export interface LlmPort {
  generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>>;
  classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>>;
}

export const EmbeddingRequestSchema = z.strictObject({
  texts: z.array(z.string().min(1)).min(1)
});
export const EmbeddingVectorSchema = z.array(z.number().finite()).length(768);
export const EmbeddingResponseSchema = z.strictObject({
  model: z.string().min(1),
  vectors: z.array(EmbeddingVectorSchema).min(1)
});

export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

export interface EmbeddingPort {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
