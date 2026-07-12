import { randomUUID } from 'node:crypto';
import {
  LlmUsageSchema,
  type LlmPort,
  type LlmResponse,
  type StructuredLlmRequest
} from '@turni/llm';
import { z } from 'zod';

const YANDEX_COMPLETION_PATH = '/foundationModels/v1/completion';
const YANDEX_AUTHORIZATION_HEADER = 'Authorization';
const YANDEX_CONTENT_TYPE_HEADER = 'Content-Type';
const YANDEX_DATA_LOGGING_HEADER = 'X-Data-Logging-Enabled';
const YANDEX_REQUEST_ID_HEADER = 'X-Client-Request-Id';
const YANDEX_CONTENT_TYPE = 'application/json';
const YANDEX_DATA_LOGGING_DISABLED = 'false';
const YANDEX_API_KEY_PREFIX = 'Api-Key';
const YANDEX_FINAL_ALTERNATIVE_STATUS = 'ALTERNATIVE_STATUS_FINAL';
const YANDEX_REQUEST_FAILED_MESSAGE = 'YandexGPT request failed';
const YANDEX_RESPONSE_VALIDATION_FAILED_MESSAGE =
  'YandexGPT response validation failed';

const YandexGptConfigSchema = z.strictObject({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelUri: z.string().min(1)
});

const YandexCompletionResponseSchema = z.strictObject({
  result: z.strictObject({
    alternatives: z
      .array(
        z.strictObject({
          message: z.strictObject({
            role: z.literal('assistant'),
            text: z.string().min(1)
          }),
          status: z.literal(YANDEX_FINAL_ALTERNATIVE_STATUS)
        })
      )
      .min(1),
    usage: z.strictObject({
      inputTextTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative()
    })
  })
});

type YandexGptConfig = z.output<typeof YandexGptConfigSchema>;

export type YandexGptTextAdapterConfig = Readonly<{
  baseUrl: string;
  apiKey: string;
  modelUri: string;
}>;

export type FetchLike = (
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

class YandexGptRequestError extends Error {
  constructor() {
    super(YANDEX_REQUEST_FAILED_MESSAGE);
  }
}

class YandexGptResponseValidationError extends Error {
  constructor() {
    super(YANDEX_RESPONSE_VALIDATION_FAILED_MESSAGE);
  }
}

export class YandexGptTextAdapter implements LlmPort {
  private readonly config: YandexGptConfig;

  constructor(config: YandexGptTextAdapterConfig, private readonly fetch: FetchLike) {
    this.config = YandexGptConfigSchema.parse(config);
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
        headers: this.headers(request.correlationId ?? randomUUID()),
        body: JSON.stringify({
          modelUri: this.config.modelUri,
          completionOptions: { stream: false },
          jsonObject: true,
          messages: request.messages.map((message) => ({
            role: message.role,
            text: message.content
          }))
        })
      });

      if (!response.ok) {
        throw new YandexGptRequestError();
      }

      return this.parseResponse<TSchema>(await response.text(), request.outputSchema);
    } catch (error) {
      if (
        error instanceof YandexGptRequestError ||
        error instanceof YandexGptResponseValidationError
      ) {
        throw error;
      }

      throw new YandexGptRequestError();
    }
  }

  private parseResponse<TSchema extends z.ZodType>(
    responseBody: string,
    outputSchema: TSchema
  ): LlmResponse<z.output<TSchema>> {
    try {
      const parsedResponse = YandexCompletionResponseSchema.safeParse(
        JSON.parse(responseBody)
      );
      if (!parsedResponse.success) {
        throw new YandexGptResponseValidationError();
      }

      const alternative = parsedResponse.data.result.alternatives[0];
      if (!alternative) {
        throw new YandexGptResponseValidationError();
      }

      const parsedOutput = outputSchema.safeParse(
        JSON.parse(alternative.message.text)
      );
      if (!parsedOutput.success) {
        throw new YandexGptResponseValidationError();
      }

      return {
        output: parsedOutput.data,
        model: this.config.modelUri,
        usage: LlmUsageSchema.parse({
          inputTokens: parsedResponse.data.result.usage.inputTextTokens,
          outputTokens: parsedResponse.data.result.usage.completionTokens,
          cachedTokens: 0
        })
      };
    } catch (error) {
      if (error instanceof YandexGptResponseValidationError) {
        throw error;
      }

      throw new YandexGptResponseValidationError();
    }
  }

  private completionUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${YANDEX_COMPLETION_PATH}`;
  }

  private headers(correlationId: string): Record<string, string> {
    return {
      [YANDEX_AUTHORIZATION_HEADER]: `${YANDEX_API_KEY_PREFIX} ${this.config.apiKey}`,
      [YANDEX_CONTENT_TYPE_HEADER]: YANDEX_CONTENT_TYPE,
      [YANDEX_DATA_LOGGING_HEADER]: YANDEX_DATA_LOGGING_DISABLED,
      [YANDEX_REQUEST_ID_HEADER]: correlationId
    };
  }
}
