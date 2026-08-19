import { describe, expect, it, vi } from 'vitest';
import { GoogleOauthClient, GOOGLE_OAUTH_SCOPES } from '../google-oauth-client.js';

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
      )
  );
}

describe('GoogleOauthClient', () => {
  it('builds a consent URL carrying exactly the two scopes and offline access', () => {
    const client = new GoogleOauthClient({ clientId: 'id', clientSecret: 'shh' });

    const url = new URL(
      client.authorizationUrl({ state: 'state-token', redirectUri: 'https://app.example/cb' })
    );

    expect(url.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.toString()).not.toContain('shh');
  });

  it('exchanges a code for a refresh token without putting the client secret in a URL', async () => {
    const fetchMock = respond({
      refresh_token: 'r-token', access_token: 'a-token', expires_in: 3600,
      scope: GOOGLE_OAUTH_SCOPES.join(' '), token_type: 'Bearer'
    });
    const client = new GoogleOauthClient({ clientId: 'id', clientSecret: 'shh', fetch: fetchMock });

    const result = await client.exchangeCode({ code: 'auth-code', redirectUri: 'https://app.example/cb' });

    expect(result.refreshToken).toBe('r-token');
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(String(url)).not.toContain('shh');
    expect(String(init.body as string | URLSearchParams)).toContain('client_secret=shh');
  });

  it('turns a token error into GoogleApiError without leaking the client secret', async () => {
    const client = new GoogleOauthClient({
      clientId: 'id', clientSecret: 'shh',
      fetch: respond({ error: 'invalid_grant', error_description: 'Bad code' }, 400)
    });

    const failure = await client
      .exchangeCode({ code: 'bad', redirectUri: 'https://app.example/cb' })
      .catch((error: unknown) => error);

    expect(JSON.stringify(failure)).not.toContain('shh');
  });
});
