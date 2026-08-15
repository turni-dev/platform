import { z } from 'zod';

export type FetchLike = typeof fetch;

const apiVersion = '5.199';
const apiBase = 'https://api.vk.ru/method';

const VkEnvelopeSchema = z.object({
  response: z.unknown().optional(),
  error: z
    .object({ error_code: z.number().int(), error_msg: z.string() })
    .optional()
});

/**
 * Carries the method and VK's own code, never the key and never the request
 * body: an error object ends up in logs and in serialized failures.
 */
export class VkApiError extends Error {
  public constructor(
    public readonly method: string,
    public readonly code: number,
    reason: string
  ) {
    super(`VK ${method} failed (${code}): ${reason}`);
    this.name = 'VkApiError';
  }
}

export class VkApiClient {
  private readonly accessKey: string;
  private readonly fetch: FetchLike;

  public constructor(input: Readonly<{ accessKey: string; fetch?: FetchLike }>) {
    if (input.accessKey.trim().length === 0) {
      throw new Error('A VK access key is required');
    }

    this.accessKey = input.accessKey;
    this.fetch = input.fetch ?? fetch;
  }

  /** The key travels in the body: a URL reaches access logs and proxies, a
   * form body does not. */
  public async call(
    method: string,
    parameters: Readonly<Record<string, string | number>>
  ): Promise<unknown> {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(parameters)) {
      body.set(name, String(value));
    }
    body.set('access_token', this.accessKey);
    body.set('v', apiVersion);

    const response = await this.fetch(`${apiBase}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new VkApiError(method, response.status, 'transport failure');
    }

    const envelope = VkEnvelopeSchema.parse(await response.json());
    if (envelope.error !== undefined) {
      throw new VkApiError(method, envelope.error.error_code, envelope.error.error_msg);
    }

    return envelope.response;
  }

  /** Key material must survive neither a log line nor a serialized object. */
  public toJSON(): string {
    return '[VkApiClient]';
  }
}
