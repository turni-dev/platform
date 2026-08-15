import { OwnerRole, ProblemType } from '@turni/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OwnerAccessTokenService } from '../../../modules/tenancy/application/owner-access-token.js';
import { AuthCookieName } from '../auth-cookies.js';
import { OwnerRequestGuard, type AuthenticatedOwner } from '../owner-request-guard.js';

const secret = 'owner-auth-secret-with-at-least-thirty-two-characters';
const origin = 'https://app.turni.ru';
const userId = '01900000-0000-7000-8000-000000000001';
const tenantId = '01900000-0000-7000-8000-000000000002';
const sessionId = '01900000-0000-7000-8000-000000000003';

const accessTokens = new OwnerAccessTokenService(secret);

function validToken(now = new Date()): string {
  return accessTokens.issue({ userId, tenantId, sessionId }, now);
}

function cookie(token: string): string {
  return `${AuthCookieName.Access}=${token}`;
}

/** Records what the handler saw, so a guard that leaks through is visible. */
interface Reached {
  readonly owners: AuthenticatedOwner[];
}

function appWithGuard(): { app: FastifyInstance; reached: Reached } {
  const app = Fastify();
  const reached: Reached = { owners: [] };
  const guard = new OwnerRequestGuard({ accessTokens, allowedOrigins: [origin] });

  app.get(
    '/read',
    guard.read(async (_request, reply, owner) => {
      reached.owners.push(owner);
      return reply.code(200).send({ tenantId: owner.tenantId });
    })
  );
  app.post(
    '/write',
    guard.mutate(async (_request, reply, owner) => {
      reached.owners.push(owner);
      return reply.code(204).send();
    })
  );

  return { app, reached };
}

describe('OwnerRequestGuard', () => {
  let app: FastifyInstance;
  let reached: Reached;

  beforeEach(() => {
    ({ app, reached } = appWithGuard());
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses a request without a session cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/read' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      type: ProblemType.Unauthorized,
      status: 401
    });
    expect(reached.owners).toEqual([]);
  });

  it('refuses a tampered token without telling the caller what broke', async () => {
    const [head, payload] = validToken().split('.');
    const response = await app.inject({
      method: 'GET',
      url: '/read',
      headers: { cookie: cookie(`${head}.${payload}.forged-signature`) }
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.stringify(response.json())).not.toContain('signature');
    expect(reached.owners).toEqual([]);
  });

  it('refuses a token that has expired', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/read',
      headers: {
        cookie: cookie(validToken(new Date(Date.now() - 60 * 60 * 1000)))
      }
    });

    expect(response.statusCode).toBe(401);
    expect(reached.owners).toEqual([]);
  });

  it('hands a verified owner and their tenant to the handler', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/read',
      headers: { cookie: cookie(validToken()) }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tenantId });
    expect(reached.owners).toEqual([{ userId, tenantId, sessionId, role: OwnerRole }]);
  });

  it('refuses a mutation without a trusted origin before reading the session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/write',
      headers: { cookie: cookie(validToken()) }
    });

    expect(response.statusCode).toBe(403);
    expect(reached.owners).toEqual([]);
  });

  it('refuses a mutation from a foreign origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/write',
      headers: { origin: 'https://evil.example', cookie: cookie(validToken()) }
    });

    expect(response.statusCode).toBe(403);
    expect(reached.owners).toEqual([]);
  });

  it('still demands a session on a mutation from a trusted origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/write',
      headers: { origin }
    });

    expect(response.statusCode).toBe(401);
    expect(reached.owners).toEqual([]);
  });

  it('runs a mutation that carries both a trusted origin and a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/write',
      headers: { origin, cookie: cookie(validToken()) }
    });

    expect(response.statusCode).toBe(204);
    expect(reached.owners).toHaveLength(1);
  });

  it('accepts a referer when the browser sent no origin header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/write',
      headers: { referer: `${origin}/dashboard`, cookie: cookie(validToken()) }
    });

    expect(response.statusCode).toBe(204);
  });
});
