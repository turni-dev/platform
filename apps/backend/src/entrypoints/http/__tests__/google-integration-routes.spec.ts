import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '../app.js';
import { SecretCipher } from '../../../platform/crypto/secret-cipher.js';
import type { SecretKeyRing } from '../../../platform/crypto/secret-key-ring.js';
import { GOOGLE_OAUTH_SCOPES } from '../../../platform/integrations/google/google-oauth-client.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { GoogleIntegrationAnalytics } from '../../../modules/integrations/google/application/google-integration-analytics.js';
import { GoogleOauthStateService } from '../../../modules/integrations/google/application/google-oauth-state.js';
import type {
  GoogleConnectionRecord,
  GoogleConnectionRepositoryPort,
  GoogleConnectionSummary
} from '../../../modules/integrations/google/application/google-connection-repository.port.js';
import {
  GoogleConnectionService,
  type GoogleOauthPort
} from '../../../modules/integrations/google/application/google-connection-service.js';
import { OwnerAccessTokenService } from '../../../modules/tenancy/application/owner-access-token.js';
import { AuthCookieName } from '../auth-cookies.js';

const origin = 'https://app.turni.ru';
const cabinetRedirectUrl = 'https://app.turni.ru/agent/integrations/google';
const tenantId = '01900000-0000-7000-8000-000000000010';
const userId = '01900000-0000-7000-8000-000000000011';
const agentId = '01900000-0000-7000-8000-000000000012';
const connectionId = '01900000-0000-7000-8000-000000000013';
const eventId = '01900000-0000-7000-8000-000000000014';
const sessionId = '01900000-0000-7000-8000-000000000015';
const ownerAuthSecret = 'owner-auth-secret-with-at-least-thirty-two-characters';
const stateSecret = 'google-oauth-state-secret-long-enough-for-hmac';

const keyRing: SecretKeyRing = {
  currentVersion: 1,
  forVersion: (version) => (version === 1 ? Buffer.alloc(32, 7) : undefined),
  toJSON: () => '[test key ring]'
};

class InMemoryConnections implements GoogleConnectionRepositoryPort {
  public readonly rows: GoogleConnectionRecord[] = [];

  public create(record: GoogleConnectionRecord): Promise<void> {
    this.rows.push(record);

    return Promise.resolve();
  }

  public findByTenant(tenant: string): Promise<GoogleConnectionSummary | undefined> {
    const row = [...this.rows].reverse().find((candidate) => candidate.tenantId === tenant);
    if (row === undefined || row.googleAccountEmail === null) {
      return Promise.resolve(undefined);
    }

    const calendarId = row.resources['calendarId'];
    const spreadsheetId = row.resources['spreadsheetId'];

    return Promise.resolve({
      id: row.id,
      status: row.status,
      googleAccountEmail: row.googleAccountEmail,
      ...(typeof calendarId === 'string' ? { calendarId } : {}),
      ...(typeof spreadsheetId === 'string' ? { spreadsheetId } : {})
    });
  }

  public activate(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      resources: { calendarId: string; spreadsheetId: string };
    }>
  ): Promise<boolean> {
    const row = this.rows.find(
      (candidate) =>
        candidate.tenantId === input.tenantId &&
        candidate.id === input.connectionId &&
        candidate.status === 'pending'
    );
    if (row === undefined) {
      return Promise.resolve(false);
    }

    this.rows[this.rows.indexOf(row)] = {
      ...row,
      status: 'active',
      resources: { ...input.resources }
    };

    return Promise.resolve(true);
  }

  public updateRefreshToken(
    input: Readonly<{ tenantId: string; connectionId: string; refreshTokenEncrypted: string }>
  ): Promise<void> {
    const row = this.rows.find(
      (candidate) => candidate.tenantId === input.tenantId && candidate.id === input.connectionId
    );
    if (row !== undefined) {
      this.rows[this.rows.indexOf(row)] = {
        ...row,
        refreshTokenEncrypted: input.refreshTokenEncrypted
      };
    }

    return Promise.resolve();
  }
}

class FakeGoogleOauthClient implements GoogleOauthPort {
  public exchangedCodes: string[] = [];
  /** Simulates a genuine downstream failure — Google's token endpoint
   * erroring, a timeout, whatever — distinct from an untrusted `state`. */
  public failExchangeWith: Error | undefined;

  public authorizationUrl(input: Readonly<{ state: string; redirectUri: string }>): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
    url.searchParams.set('state', input.state);

    return url.toString();
  }

  public exchangeCode(input: Readonly<{ code: string; redirectUri: string }>): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: Date;
    scopes: readonly string[];
  }> {
    if (this.failExchangeWith !== undefined) {
      return Promise.reject(this.failExchangeWith);
    }

    this.exchangedCodes.push(input.code);

    return Promise.resolve({
      refreshToken: 'r-token',
      accessToken: 'a-token',
      expiresAt: new Date('2026-08-19T11:00:00.000Z'),
      scopes: GOOGLE_OAUTH_SCOPES
    });
  }

  public fetchAccountEmail(): Promise<string> {
    return Promise.resolve('owner@example.com');
  }
}

function cookie(token: string): string {
  return `${AuthCookieName.Access}=${token}`;
}

function build(): {
  app: Promise<Awaited<ReturnType<typeof createHttpApp>>>;
  connections: InMemoryConnections;
  oauth: FakeGoogleOauthClient;
  stateService: GoogleOauthStateService;
  accessTokens: OwnerAccessTokenService;
  service: GoogleConnectionService;
} {
  const connections = new InMemoryConnections();
  const oauth = new FakeGoogleOauthClient();
  const stateService = new GoogleOauthStateService(
    stateSecret,
    () => new Date('2026-08-19T10:00:00.000Z')
  );
  const cipher = new SecretCipher('credentials', keyRing);
  const events = new FakeDomainEventBus();
  const accessTokens = new OwnerAccessTokenService(ownerAuthSecret);
  let sequence = 0;
  const ids = {
    next: (): string => {
      sequence += 1;

      return sequence === 1 ? connectionId : `01900000-0000-7000-8000-0000000002${String(sequence).padStart(2, '0')}`;
    }
  };
  const service = new GoogleConnectionService({
    connections,
    cipher,
    agents: { findByTenant: () => Promise.resolve({ agentId }) },
    oauth,
    stateService,
    redirectUri: 'https://hooks.turni.test/api/v1/integrations/google/callback',
    ids,
    analytics: new GoogleIntegrationAnalytics(events, { next: () => eventId }),
    clock: () => new Date('2026-08-19T10:00:00.000Z')
  });

  return {
    connections,
    oauth,
    stateService,
    accessTokens,
    service,
    app: createHttpApp({
      google: {
        service,
        connections,
        accessTokens,
        allowedOrigins: [origin],
        cabinetRedirectUrl
      }
    })
  };
}

describe('Google integration HTTP routes', () => {
  let context: ReturnType<typeof build>;
  let app: Awaited<ReturnType<typeof createHttpApp>>;

  beforeEach(async () => {
    context = build();
    app = await context.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses an unauthenticated read of the connection summary', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/integrations/google' });

    expect(response.statusCode).toBe(401);
  });

  it('reports disconnected when the tenant has no connection', async () => {
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/google',
      headers: { cookie: cookie(token) }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'disconnected' });
  });

  it('starts consent with a URL containing exactly the two least-privilege scopes', async () => {
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/google/consent',
      headers: { origin, cookie: cookie(token) }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ url: string }>();
    const parsed = new URL(body.url);
    expect(parsed.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(parsed.searchParams.get('scope')?.split(' ')).toHaveLength(2);
  });

  it('refuses a consent request without a trusted origin', async () => {
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/google/consent',
      headers: { cookie: cookie(token) }
    });

    expect(response.statusCode).toBe(403);
  });

  it('refuses a callback with a forged state and writes nothing', async () => {
    const forgedState = new GoogleOauthStateService(
      'a-completely-different-state-secret-long-enough',
      () => new Date('2026-08-19T10:00:00.000Z')
    ).issue({ tenantId, userId });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/google/callback?code=auth-code&state=${encodeURIComponent(forgedState)}`
    });

    expect(response.statusCode).toBe(403);
    expect(context.connections.rows).toHaveLength(0);
  });

  it('refuses a callback missing the required query parameters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/google/callback?code=auth-code'
    });

    expect(response.statusCode).toBe(403);
    expect(context.connections.rows).toHaveLength(0);
  });

  it('surfaces a genuine downstream failure as an internal error, not a refusal', async () => {
    const state = context.stateService.issue({ tenantId, userId });
    context.oauth.failExchangeWith = new Error('Google token endpoint returned 503');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/google/callback?code=auth-code&state=${encodeURIComponent(state)}`
    });

    expect(response.statusCode).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    expect(context.connections.rows).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('completes a genuine callback and redirects into the cabinet', async () => {
    const state = context.stateService.issue({ tenantId, userId });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/google/callback?code=auth-code&state=${encodeURIComponent(state)}`
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers['location']).toBe(cabinetRedirectUrl);
    expect(context.connections.rows).toHaveLength(1);
    expect(context.connections.rows[0]?.status).toBe('pending');
  });

  it('activates a pending connection on resource selection and never returns a refresh token key', async () => {
    const state = context.stateService.issue({ tenantId, userId });
    await context.service.completeConsent({ code: 'auth-code', state });
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/google/resources',
      headers: { origin, cookie: cookie(token) },
      payload: { calendarId: 'primary', spreadsheetId: 'sheet-1' }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body).toEqual({
      id: connectionId,
      status: 'active',
      googleAccountEmail: 'owner@example.com',
      calendarId: 'primary',
      spreadsheetId: 'sheet-1'
    });
    expect(Object.keys(body)).not.toContain('refreshTokenEncrypted');
    expect(JSON.stringify(body)).not.toContain('refreshToken');
  });

  it('refuses resource selection without a pending connection', async () => {
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/google/resources',
      headers: { origin, cookie: cookie(token) },
      payload: { calendarId: 'primary', spreadsheetId: 'sheet-1' }
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a malformed resource selection body', async () => {
    const state = context.stateService.issue({ tenantId, userId });
    await context.service.completeConsent({ code: 'auth-code', state });
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/google/resources',
      headers: { origin, cookie: cookie(token) },
      payload: { calendarId: '' }
    });

    expect(response.statusCode).toBe(400);
  });

  it('reports the active summary on a later read, again without a token key', async () => {
    const state = context.stateService.issue({ tenantId, userId });
    await context.service.completeConsent({ code: 'auth-code', state });
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });
    await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/google/resources',
      headers: { origin, cookie: cookie(token) },
      payload: { calendarId: 'primary', spreadsheetId: 'sheet-1' }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/google',
      headers: { cookie: cookie(token) }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body['status']).toBe('active');
    expect(Object.keys(body)).not.toContain('refreshTokenEncrypted');
  });
});
