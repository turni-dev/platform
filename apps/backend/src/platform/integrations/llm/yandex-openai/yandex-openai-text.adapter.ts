import {
  LlmUsageSchema,
  type LlmPort,
  type LlmResponse,
  type StructuredLlmRequest
} from '@turni/llm';
import { z } from 'zod';

const DEFAULT_BASE_URL = 'https://ai.api.cloud.yandex.net/v1';
const CHAT_COMPLETIONS_PATH = '/chat/completions';
const AUTHORIZATION_HEADER = 'Authorization';
const OPENAI_PROJECT_HEADER = 'OpenAI-Project';
const CONTENT_TYPE_HEADER = 'Content-Type';
const DATA_LOGGING_HEADER = 'X-Data-Logging-Enabled';
const API_KEY_PREFIX = 'Api-Key';
const JSON_CONTENT_TYPE = 'application/json';
const DATA_LOGGING_DISABLED = 'false';
const REQUEST_FAILED_MESSAGE = 'Yandex OpenAI request failed';
const RESPONSE_VALIDATION_FAILED_MESSAGE =
  'Yandex OpenAI response validation failed';

const YandexOpenAiConfigSchema = z.strictObject({
  apiKey: z.string().min(1),
  folderId: z.string().min(1),
  modelUri: z.string().min(1),
  baseUrl: z.string().url().default(DEFAULT_BASE_URL)
});

const OpenAiCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().min(1) }).passthrough()
      }).passthrough()
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z
      .object({ cached_tokens: z.number().int().nonnegative() })
      .passthrough()
      .optional()
  }).passthrough()
}).passthrough();

type YandexOpenAiConfig = z.output<typeof YandexOpenAiConfigSchema>;

export type YandexOpenAiTextAdapterConfig = Readonly<{
  apiKey: string;
  folderId: string;
  modelUri: string;
  baseUrl?: string;
}>;

type FetchLike = (
  url: string,
  init: Readonly<{
    method: 'POST';
    headers: Readonly<Record<string, string>>;
    body: string;
  }>
) => Promise<
  Readonly<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>
>;

type ResponseFormat = Readonly<{
  type: 'json_schema';
  json_schema: Readonly<{
    name: 'structured_output';
    strict: true;
    schema: Record<string, unknown>;
  }>;
}>;

class YandexOpenAiRequestError extends Error {
  constructor() {
    super(REQUEST_FAILED_MESSAGE);
  }
}

class YandexOpenAiResponseValidationError extends Error {
  constructor() {
    super(RESPONSE_VALIDATION_FAILED_MESSAGE);
  }
}

export class YandexOpenAiTextAdapter implements LlmPort {
  private readonly config: YandexOpenAiConfig;

  constructor(
    config: YandexOpenAiTextAdapterConfig,
    private readonly fetch: FetchLike
  ) {
    this.config = YandexOpenAiConfigSchema.parse(config);
  }

  generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    return this.complete(request);
  }

  classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    return this.complete(request);
  }

  private async complete<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    try {
      const response = await this.fetch(this.completionUrl(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.config.modelUri,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content
          })),
          ...(this.responseFormat(request.outputSchema) ?? {})
        })
      });

      if (!response.ok) {
        throw new YandexOpenAiRequestError();
      }

      return this.parseResponse(await response.text(), request.outputSchema);
    } catch (error) {
      if (
        error instanceof YandexOpenAiRequestError ||
        error instanceof YandexOpenAiResponseValidationError
      ) {
        throw error;
      }

      throw new YandexOpenAiRequestError();
    }
  }

  private parseResponse<TSchema extends z.ZodType>(
    responseBody: string,
    outputSchema: TSchema
  ): LlmResponse<z.output<TSchema>> {
    try {
      const response = OpenAiCompletionResponseSchema.safeParse(JSON.parse(responseBody));
      if (!response.success) {
        throw new YandexOpenAiResponseValidationError();
      }

      const choice = response.data.choices[0];
      if (!choice) {
        throw new YandexOpenAiResponseValidationError();
      }

      const output = outputSchema.safeParse(JSON.parse(choice.message.content));
      if (!output.success) {
        throw new YandexOpenAiResponseValidationError();
      }

      return {
        output: output.data,
        model: this.config.modelUri,
        usage: LlmUsageSchema.parse({
          inputTokens: response.data.usage.prompt_tokens,
          outputTokens: response.data.usage.completion_tokens,
          cachedTokens: response.data.usage.prompt_tokens_details?.cached_tokens ?? 0
        })
      };
    } catch (error) {
      if (error instanceof YandexOpenAiResponseValidationError) {
        throw error;
      }

      throw new YandexOpenAiResponseValidationError();
    }
  }

  private completionUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${CHAT_COMPLETIONS_PATH}`;
  }

  private headers(): Record<string, string> {
    return {
      [AUTHORIZATION_HEADER]: `${API_KEY_PREFIX} ${this.config.apiKey}`,
      [OPENAI_PROJECT_HEADER]: this.config.folderId,
      [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE,
      [DATA_LOGGING_HEADER]: DATA_LOGGING_DISABLED
    };
  }

  private responseFormat(outputSchema: z.ZodType):
    | Readonly<{ response_format: ResponseFormat }>
    | undefined {
    try {
      const schema = Object.fromEntries(
        Object.entries(z.toJSONSchema(outputSchema)).filter(
          ([property]) => property !== '$schema'
        )
      );
      return {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema
          }
        }
      };
    } catch {
      return undefined;
    }
  }
}
