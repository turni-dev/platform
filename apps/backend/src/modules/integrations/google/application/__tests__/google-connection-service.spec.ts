import { beforeEach, describe, expect, it } from 'vitest';
import { SecretCipher } from '../../../../../platform/crypto/secret-cipher.js';
import type { SecretKeyRing } from '../../../../../platform/crypto/secret-key-ring.js';
import { GOOGLE_OAUTH_SCOPES } from '../../../../../platform/integrations/google/google-oauth-client.js';
import { FakeDomainEventBus } from '../../../../reporting/application/fake-domain-event-bus.js';
import { GoogleIntegrationAnalytics } from '../google-integration-analytics.js';
import { GoogleOauthStateService } from '../google-oauth-state.js';
import type {
  GoogleConnectionRecord,
  GoogleConnectionRepositoryPort,
  GoogleConnectionSummary
} from '../google-connection-repository.port.js';
import {
  GoogleAgentMissingError,
  GoogleConnectionNotPendingError,
  GoogleConnectionService,
  type GoogleOauthPort
} from '../google-connection-service.js';

const tenantId = '01900000-0000-7000-8000-000000000010';
const userId = '01900000-0000-7000-8000-000000000011';
const agentId = '01900000-0000-7000-8000-000000000012';
const connectionId = '01900000-0000-7000-8000-000000000013';
const eventId = '01900000-0000-7000-8000-000000000014';

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

  public authorizationUrl(input: Readonly<{ state: string; redirectUri: string }>): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', 'client-id');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', input.state);

    return url.toString();
  }

  public exchangeCode(input: Readonly<{ code: string; redirectUri: string }>): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: Date;
    scopes: readonly string[];
  }> {
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

function build(): {
  service: GoogleConnectionService;
  repository: InMemoryConnections;
  oauth: FakeGoogleOauthClient;
  stateService: GoogleOauthStateService;
  cipher: SecretCipher;
  events: FakeDomainEventBus;
} {
  const repository = new InMemoryConnections();
  const oauth = new FakeGoogleOauthClient();
  const stateService = new GoogleOauthStateService(
    'google-oauth-state-secret-long-enough-for-hmac',
    () => new Date('2026-08-19T10:00:00.000Z')
  );
  const cipher = new SecretCipher('credentials', keyRing);
  const events = new FakeDomainEventBus();

  return {
    repository,
    oauth,
    stateService,
    cipher,
    events,
    service: new GoogleConnectionService({
      connections: repository,
      cipher,
      agents: { findByTenant: () => Promise.resolve({ agentId }) },
      oauth,
      stateService,
      redirectUri: 'https://app.example/api/v1/integrations/google/callback',
      ids: { next: () => connectionId },
      analytics: new GoogleIntegrationAnalytics(events, { next: () => eventId }),
      clock: () => new Date('2026-08-19T10:00:00.000Z')
    })
  };
}

describe('GoogleConnectionService', () => {
  let context: ReturnType<typeof build>;

  beforeEach(() => {
    context = build();
  });

  it('starts consent with a signed state and the two least-privilege scopes', async () => {
    const { url } = await context.service.startConsent({ tenantId, userId });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(() => context.stateService.verify(parsed.searchParams.get('state')!)).not.toThrow();
  });

  it('writes nothing while starting consent', async () => {
    await context.service.startConsent({ tenantId, userId });

    expect(context.repository.rows).toHaveLength(0);
  });

  it('completes consent, stores the refresh token encrypted, and never logs or emits it', async () => {
    const state = context.stateService.issue({ tenantId, userId });

    const result = await context.service.completeConsent({ code: 'auth-code', state });

    expect(result).toEqual({ tenantId, connectionId, googleAccountEmail: 'owner@example.com' });

    const stored = context.repository.rows[0]!;
    expect(stored.status).toBe('pending');
    expect(stored.refreshTokenEncrypted).not.toContain('r-token');
    expect(context.cipher.decrypt(stored.refreshTokenEncrypted!, tenantId)).toBe('r-token');
    expect(JSON.stringify(context.events.publishedEvents)).not.toContain('r-token');
  });

  it('refuses a replayed state', async () => {
    const state = context.stateService.issue({ tenantId, userId });
    await context.service.completeConsent({ code: 'auth-code', state });

    await expect(
      context.service.completeConsent({ code: 'auth-code-2', state })
    ).rejects.toThrow();
    expect(context.repository.rows).toHaveLength(1);
  });

  it('refuses a tenant that has no agent to belong to', async () => {
    const repository = new InMemoryConnections();
    const oauth = new FakeGoogleOauthClient();
    const stateService = new GoogleOauthStateService(
      'google-oauth-state-secret-long-enough-for-hmac',
      () => new Date('2026-08-19T10:00:00.000Z')
    );
    const events = new FakeDomainEventBus();
    const service = new GoogleConnectionService({
      connections: repository,
      cipher: new SecretCipher('credentials', keyRing),
      agents: { findByTenant: () => Promise.resolve(undefined) },
      oauth,
      stateService,
      redirectUri: 'https://app.example/api/v1/integrations/google/callback',
      ids: { next: () => connectionId },
      analytics: new GoogleIntegrationAnalytics(events, { next: () => eventId }),
      clock: () => new Date('2026-08-19T10:00:00.000Z')
    });
    const state = stateService.issue({ tenantId, userId });

    await expect(
      service.completeConsent({ code: 'auth-code', state })
    ).rejects.toBeInstanceOf(GoogleAgentMissingError);
    expect(repository.rows).toHaveLength(0);
  });

  it('activates the connection once resources are picked, never before', async () => {
    const state = context.stateService.issue({ tenantId, userId });
    const { connectionId: newConnectionId } = await context.service.completeConsent({
      code: 'auth-code',
      state
    });
    expect(context.repository.rows[0]!.status).toBe('pending');

    const summary = await context.service.selectResources({
      tenantId,
      connectionId: newConnectionId,
      calendarId: 'primary',
      spreadsheetId: 'sheet-1'
    });

    expect(summary.status).toBe('active');
    expect(summary.calendarId).toBe('primary');
    expect(summary.spreadsheetId).toBe('sheet-1');
    expect(context.repository.rows[0]!.status).toBe('active');
  });

  it('refuses to activate an unknown connection', async () => {
    await expect(
      context.service.selectResources({
        tenantId,
        connectionId: '01900000-0000-7000-8000-000000000099',
        calendarId: 'primary',
        spreadsheetId: 'sheet-1'
      })
    ).rejects.toBeInstanceOf(GoogleConnectionNotPendingError);
  });
});
