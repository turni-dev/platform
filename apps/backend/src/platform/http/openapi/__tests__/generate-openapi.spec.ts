import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from '../generate-openapi.js';

describe('generateOpenApiDocument', () => {
  it('produces a valid OpenAPI 3.1 envelope', () => {
    const document = generateOpenApiDocument();

    expect(document['openapi']).toBe('3.1.0');
    expect(document['info']).toMatchObject({ title: 'Turni Backend API' });
    expect(document['paths']).toBeTypeOf('object');
  });

  it('derives the health path schema from HealthStatusSchema, not hand-written YAML', () => {
    const document = generateOpenApiDocument() as {
      paths: Record<string, unknown>;
    };
    const healthGet = (
      document.paths['/healthz'] as { get: { responses: Record<string, unknown> } }
    ).get;
    const okResponse = healthGet.responses['200'] as {
      content: { 'application/json': { schema: { properties?: Record<string, unknown> } } };
    };
    const schema = okResponse.content['application/json'].schema;

    expect(schema.properties).toHaveProperty('status');
    expect(schema.properties).toHaveProperty('service');
  });

  it('covers the readiness endpoint with a 503 problem+json response', () => {
    const document = generateOpenApiDocument() as {
      paths: Record<string, { get: { responses: Record<string, { content?: Record<string, unknown> }> } }>;
    };
    const readyPath = document.paths['/readyz'];
    if (readyPath === undefined) {
      throw new Error('Expected the generated document to include /readyz');
    }
    const readyResponses = readyPath.get.responses;

    expect(readyResponses['200']).toBeDefined();
    expect(readyResponses['503']?.content).toHaveProperty('application/problem+json');
  });

  it('covers the guest session POST endpoint with a request body schema', () => {
    const document = generateOpenApiDocument() as {
      paths: Record<
        string,
        { post: { requestBody: { content: { 'application/json': { schema: { required?: string[] } } } } } }
      >;
    };
    const guestSessionsPath = document.paths['/api/v1/guest/sessions'];
    if (guestSessionsPath === undefined) {
      throw new Error('Expected the generated document to include /api/v1/guest/sessions');
    }
    const requestSchema =
      guestSessionsPath.post.requestBody.content['application/json'].schema;

    expect(requestSchema.required).toContain('widgetKey');
  });

  it('is deterministic across calls, matching a build artifact regenerated in CI', () => {
    expect(generateOpenApiDocument()).toEqual(generateOpenApiDocument());
  });
});
