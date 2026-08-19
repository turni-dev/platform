import { z } from 'zod';
import type { SecretCipher } from '../../../../platform/crypto/secret-cipher.js';
import type { GoogleOauthStateService } from './google-oauth-state.js';
import type { GoogleIntegrationAnalytics } from './google-integration-analytics.js';
import {
  GoogleConnectionSummarySchema,
  type GoogleConnectionRepositoryPort,
  type GoogleConnectionSummary
} from './google-connection-repository.port.js';

/** The wizard needs only these three abilities of the OAuth client — never
 * the client secret it holds, never a way to call Calendar or Sheets. */
export interface GoogleOauthPort {
  authorizationUrl(input: Readonly<{ state: string; redirectUri: string }>): string;
  exchangeCode(input: Readonly<{ code: string; redirectUri: string }>): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: Date;
    scopes: readonly string[];
  }>;
  /** Display-only identity of the connected Google account; never trusted as
   * an authentication claim. */
  fetchAccountEmail(accessToken: string): Promise<string>;
}

export interface GoogleAgentLookup {
  findByTenant(tenantId: string): Promise<Readonly<{ agentId: string }> | undefined>;
}

export interface GoogleConnectionIdGenerator {
  next(): string;
}

export class GoogleAgentMissingError extends Error {
  public constructor() {
    super('A Google connection needs an agent to belong to');
    this.name = 'GoogleAgentMissingError';
  }
}

export class GoogleConnectionNotPendingError extends Error {
  public constructor() {
    super('The connection is not awaiting resource selection');
    this.name = 'GoogleConnectionNotPendingError';
  }
}

export class GoogleConnectionMissingError extends Error {
  public constructor() {
    super('The Google connection could not be found after activation');
    this.name = 'GoogleConnectionMissingError';
  }
}

const StartConsentInputSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7()
});

const CompleteConsentInputSchema = z.strictObject({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1)
});

const SelectResourcesInputSchema = z.strictObject({
  tenantId: z.uuidv7(),
  connectionId: z.uuidv7(),
  calendarId: z.string().trim().min(1),
  spreadsheetId: z.string().trim().min(1)
});

export interface GoogleConnectionServiceOptions {
  readonly connections: GoogleConnectionRepositoryPort;
  readonly cipher: SecretCipher;
  readonly agents: GoogleAgentLookup;
  readonly oauth: GoogleOauthPort;
  readonly stateService: GoogleOauthStateService;
  readonly redirectUri: string;
  readonly ids: GoogleConnectionIdGenerator;
  readonly analytics: GoogleIntegrationAnalytics;
  readonly clock: () => Date;
}

/**
 * The three steps of connecting Google: send the owner to Google's consent
 * screen, turn the code Google hands back into an encrypted refresh token
 * and a `pending` row, and — once the owner has picked which calendar and
 * spreadsheet to use — flip that row to `active`. Google is never a source
 * of authentication here: the state carries the tenant and user who already
 * held a session before the redirect, and the callback trusts nothing about
 * identity beyond that signed claim.
 */
export class GoogleConnectionService {
  public constructor(private readonly options: GoogleConnectionServiceOptions) {}

  public startConsent(
    input: Readonly<{ tenantId: string; userId: string }>
  ): Promise<{ url: string }> {
    const request = StartConsentInputSchema.parse(input);
    const state = this.options.stateService.issue({
      tenantId: request.tenantId,
      userId: request.userId
    });

    return Promise.resolve({
      url: this.options.oauth.authorizationUrl({
        state,
        redirectUri: this.options.redirectUri
      })
    });
  }

  public async completeConsent(
    input: Readonly<{ code: string; state: string }>
  ): Promise<{ tenantId: string; connectionId: string; googleAccountEmail: string }> {
    const request = CompleteConsentInputSchema.parse(input);
    // Single-use: a state that already unlocked one callback throws here on
    // a replay, before any code exchange or write happens.
    const claims = this.options.stateService.verify(request.state);

    const agent = await this.options.agents.findByTenant(claims.tenantId);
    if (agent === undefined) {
      throw new GoogleAgentMissingError();
    }

    const exchanged = await this.options.oauth.exchangeCode({
      code: request.code,
      redirectUri: this.options.redirectUri
    });
    const googleAccountEmail = await this.options.oauth.fetchAccountEmail(
      exchanged.accessToken
    );

    const connectionId = this.options.ids.next();

    // The row is created `pending`, never `active`: the owner still has to
    // pick which calendar and spreadsheet this connection speaks to.
    await this.options.connections.create({
      id: connectionId,
      tenantId: claims.tenantId,
      agentId: agent.agentId,
      status: 'pending',
      scopes: [...exchanged.scopes],
      refreshTokenEncrypted: this.options.cipher.encrypt(
        exchanged.refreshToken,
        claims.tenantId
      ),
      googleAccountEmail,
      resources: {}
    });

    await this.options.analytics.connected({
      tenantId: claims.tenantId,
      connectionId,
      at: this.options.clock()
    });

    return { tenantId: claims.tenantId, connectionId, googleAccountEmail };
  }

  public async selectResources(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      calendarId: string;
      spreadsheetId: string;
    }>
  ): Promise<GoogleConnectionSummary> {
    const request = SelectResourcesInputSchema.parse(input);

    const activated = await this.options.connections.activate({
      tenantId: request.tenantId,
      connectionId: request.connectionId,
      resources: {
        calendarId: request.calendarId,
        spreadsheetId: request.spreadsheetId
      }
    });
    if (!activated) {
      throw new GoogleConnectionNotPendingError();
    }

    const summary = await this.options.connections.findByTenant(request.tenantId);
    if (summary === undefined) {
      throw new GoogleConnectionMissingError();
    }

    await this.options.analytics.activated(
      { tenantId: request.tenantId, connectionId: request.connectionId, at: this.options.clock() },
      { calendarId: request.calendarId, spreadsheetId: request.spreadsheetId }
    );

    return GoogleConnectionSummarySchema.parse(summary);
  }
}
