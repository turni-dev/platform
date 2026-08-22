import {
  GuestSessionRequestSchema,
  GuestSessionSchema,
  HealthStatusSchema,
  ProblemDetailsSchema,
  ReadinessStatusSchema
} from '@turni/contracts';
import { z } from 'zod';

/**
 * Generates an OpenAPI 3.1 document straight from this repo's Zod contracts —
 * "contracts are the only type source" (AGENTS.md #4) extends to the API
 * schema too: nobody hand-writes YAML that can drift from `packages/contracts`.
 *
 * Zod v4 ships a native `z.toJSONSchema()` (see `node_modules/zod`), and
 * OpenAPI 3.1's `schema` object *is* JSON Schema 2020-12 — so no
 * `zod-to-openapi`-style adapter package is needed for this repo's contracts,
 * which are plain `z.object`/`z.strictObject` shapes with no branded
 * primitives that would need custom mapping.
 *
 * SCOPE: this generator lists three representative endpoints
 * (`GET /healthz`, `GET /readyz`, `POST /api/v1/guest/sessions`) as a proof
 * of the pattern, not full route coverage — the backend's ~30 routes span
 * several modules under active development, and wiring every one in the same
 * pass this card lands is unnecessary scope for a scaffold. Extending it is
 * mechanical:
 *
 *   1. Import the request/response Zod schema(s) for the route from
 *      `packages/contracts`.
 *   2. Add one `PathItem` entry below via `jsonSchema()` for each schema
 *      (request body / response body / problem responses).
 *   3. Re-run `npm run openapi:generate` (or `nx run backend:openapi`) and
 *      commit the refreshed `apps/backend/openapi/openapi.generated.json`.
 *
 * The generated document is a build artifact for CI/tooling (prism-mock,
 * schemathesis) — it is not meant to be hand-edited.
 */

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-7' });
}

function problemResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      'application/problem+json': {
        schema: jsonSchema(ProblemDetailsSchema)
      }
    }
  };
}

export function generateOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Turni Backend API',
      version: '0.1.0',
      description:
        'Generated from packages/contracts Zod schemas. Do not hand-edit — see generate-openapi.ts.'
    },
    paths: {
      '/healthz': {
        get: {
          operationId: 'getHealthz',
          summary: 'Liveness probe',
          responses: {
            '200': {
              description: 'The process is running.',
              content: {
                'application/json': { schema: jsonSchema(HealthStatusSchema) }
              }
            }
          }
        }
      },
      '/readyz': {
        get: {
          operationId: 'getReadyz',
          summary: 'Readiness probe',
          description: 'Verifies the process can actually serve traffic (database reachable).',
          responses: {
            '200': {
              description: 'The process and its dependencies are reachable.',
              content: {
                'application/json': { schema: jsonSchema(ReadinessStatusSchema) }
              }
            },
            '503': problemResponse('A dependency (e.g. the database) is unreachable.')
          }
        }
      },
      '/api/v1/guest/sessions': {
        post: {
          operationId: 'postGuestSessions',
          summary: 'Issue a guest chat session for a widget',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: jsonSchema(GuestSessionRequestSchema) }
            }
          },
          responses: {
            '201': {
              description: 'A durable guest session, resumable by its token.',
              content: {
                'application/json': { schema: jsonSchema(GuestSessionSchema) }
              }
            },
            '400': problemResponse('The widget key is missing, malformed, or expired.')
          }
        }
      }
    },
    components: {
      schemas: {
        ProblemDetails: jsonSchema(ProblemDetailsSchema)
      }
    }
  };
}
