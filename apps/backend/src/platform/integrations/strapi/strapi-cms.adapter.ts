import {
  CmsEntrySchema,
  CmsPageSchema,
  type CmsEntry,
  type CmsPage,
  type CmsPort
} from '@turni/contracts';
import { z } from 'zod';

const STRAPI_REQUEST_FAILED_MESSAGE = 'Strapi request failed';
const STRAPI_RESPONSE_VALIDATION_FAILED_MESSAGE =
  'Strapi response validation failed';

const StrapiCmsConfigSchema = z.strictObject({
  baseUrl: z.string().url(),
  apiToken: z.string().min(1).optional()
});

const StrapiRecordSchema = z.record(z.string(), z.unknown());

const StrapiListResponseSchema = z.object({
  data: z.array(StrapiRecordSchema)
});

const StrapiPageEntrySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  blocks: z.array(StrapiRecordSchema).default([])
});

const StrapiEntryIdentitySchema = z.object({
  id: z.union([z.number(), z.string()]),
  documentId: z.string().min(1).optional()
});

type StrapiCmsConfig = z.output<typeof StrapiCmsConfigSchema>;

export type StrapiCmsAdapterConfig = Readonly<{
  baseUrl: string;
  apiToken?: string;
}>;

export type FetchLike = (
  url: string,
  init: Readonly<{
    method: 'GET';
    headers: Readonly<Record<string, string>>;
  }>
) => Promise<
  Readonly<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>
>;

class StrapiRequestError extends Error {
  constructor() {
    super(STRAPI_REQUEST_FAILED_MESSAGE);
  }
}

class StrapiResponseValidationError extends Error {
  constructor() {
    super(STRAPI_RESPONSE_VALIDATION_FAILED_MESSAGE);
  }
}

export class StrapiCmsAdapter implements CmsPort {
  private readonly config: StrapiCmsConfig;

  constructor(config: StrapiCmsAdapterConfig, private readonly fetch: FetchLike) {
    this.config = StrapiCmsConfigSchema.parse(config);
  }

  async getPage(slug: string): Promise<CmsPage | null> {
    const validSlug = z.string().min(1).parse(slug);
    const response = await this.request(
      `/api/pages?filters[slug][$eq]=${encodeURIComponent(validSlug)}&populate=*`
    );

    const entry = this.parseList(response).data[0];
    if (!entry) {
      return null;
    }

    return this.mapPage(entry);
  }

  async getCollection(type: string): Promise<readonly CmsEntry[]> {
    const validType = z.string().min(1).parse(type);
    const response = await this.request(
      `/api/${encodeURIComponent(validType)}?populate=*`
    );

    return this.parseList(response).data.map((entry) => this.mapEntry(entry));
  }

  private async request(pathWithQuery: string): Promise<string> {
    try {
      const response = await this.fetch(this.url(pathWithQuery), {
        method: 'GET',
        headers: this.headers()
      });

      if (!response.ok) {
        throw new StrapiRequestError();
      }

      return await response.text();
    } catch (error) {
      if (error instanceof StrapiRequestError) {
        throw error;
      }

      throw new StrapiRequestError();
    }
  }

  private parseList(responseBody: string): z.output<typeof StrapiListResponseSchema> {
    try {
      const parsed = StrapiListResponseSchema.safeParse(JSON.parse(responseBody));
      if (!parsed.success) {
        throw new StrapiResponseValidationError();
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof StrapiResponseValidationError) {
        throw error;
      }

      throw new StrapiResponseValidationError();
    }
  }

  private mapPage(entry: Record<string, unknown>): CmsPage {
    const parsed = StrapiPageEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw new StrapiResponseValidationError();
    }

    return CmsPageSchema.parse({
      slug: parsed.data.slug,
      title: parsed.data.title,
      blocks: parsed.data.blocks
    });
  }

  private mapEntry(entry: Record<string, unknown>): CmsEntry {
    const identity = StrapiEntryIdentitySchema.safeParse(entry);
    if (!identity.success) {
      throw new StrapiResponseValidationError();
    }

    return CmsEntrySchema.parse({
      id: identity.data.documentId ?? String(identity.data.id),
      fields: entry
    });
  }

  private url(pathWithQuery: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${pathWithQuery}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }
    return headers;
  }
}
