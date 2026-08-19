import { z } from 'zod';

export type FetchLike = typeof fetch;

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets'
] as const;

const authorizationBase = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenBase = 'https://oauth2.googleapis.com/token';

const GoogleTokenSuccessSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string().optional()
});

const GoogleTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional()
});

/**
 * Carries Google's own fixed error code, never the client secret and never a
 * token: an error object ends up in logs and in serialized failures.
 */
export class GoogleApiError extends Error {
  public readonly status: number;

  public constructor(status: number, code: string) {
    super(`Google API request failed (${status}): ${code}`);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}

export class GoogleOauthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetch: FetchLike;

  public constructor(
    input: Readonly<{ clientId: string; clientSecret: string; fetch?: FetchLike }>
  ) {
    if (input.clientId.trim().length === 0) {
      throw new Error('A Google OAuth client id is required');
    }
    if (input.clientSecret.trim().length === 0) {
      throw new Error('A Google OAuth client secret is required');
    }

    this.clientId = input.clientId;
    this.clientSecret = input.clientSecret;
    this.fetch = input.fetch ?? fetch;
  }

  /** The client id is public; the secret never appears in a URL, here or
   * anywhere else in this client. */
  public authorizationUrl(input: Readonly<{ state: string; redirectUri: string }>): string {
    const url = new URL(authorizationBase);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'false');
    url.searchParams.set('state', input.state);

    return url.toString();
  }

  /** The secret travels in the body: a URL reaches access logs and proxies,
   * a form body does not. */
  public async exchangeCode(
    input: Readonly<{ code: string; redirectUri: string }>
  ): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: Date;
    scopes: readonly string[];
  }> {
    const body = new URLSearchParams();
    body.set('client_id', this.clientId);
    body.set('client_secret', this.clientSecret);
    body.set('code', input.code);
    body.set('redirect_uri', input.redirectUri);
    body.set('grant_type', 'authorization_code');

    const payload = await this.postToken(body);

    if (payload.refresh_token === undefined) {
      throw new GoogleApiError(200, 'missing_refresh_token');
    }

    return {
      refreshToken: payload.refresh_token,
      accessToken: payload.access_token,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
      scopes: (payload.scope ?? '').split(' ').filter((scope) => scope.length > 0)
    };
  }

  /** Only a refresh token goes in; only a fresh access token comes out. */
  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const body = new URLSearchParams();
    body.set('client_id', this.clientId);
    body.set('client_secret', this.clientSecret);
    body.set('refresh_token', refreshToken);
    body.set('grant_type', 'refresh_token');

    const payload = await this.postToken(body);

    return {
      accessToken: payload.access_token,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000)
    };
  }

  private async postToken(
    body: URLSearchParams
  ): Promise<z.infer<typeof GoogleTokenSuccessSchema>> {
    const response = await this.fetch(tokenBase, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });

    const json: unknown = await response.json();

    if (!response.ok) {
      const error = GoogleTokenErrorSchema.parse(json);
      throw new GoogleApiError(response.status, error.error);
    }

    return GoogleTokenSuccessSchema.parse(json);
  }

  /** Client secret and any token material must survive neither a log line
   * nor a serialized object. */
  public toJSON(): string {
    return '[GoogleOauthClient]';
  }
}
