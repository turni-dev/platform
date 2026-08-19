import { describe, expect, it } from 'vitest';
import { GoogleOauthStateService } from '../google-oauth-state.js';

const secret = 'google-oauth-state-secret-long-enough-for-hmac';
const claims = {
  tenantId: '01900000-0000-7000-8000-000000000010',
  userId: '01900000-0000-7000-8000-000000000011'
} as const;

describe('GoogleOauthStateService', () => {
  it('round-trips its own claims', () => {
    const service = new GoogleOauthStateService(secret);

    expect(service.verify(service.issue(claims))).toEqual(claims);
  });

  it('refuses a state signed with another secret', () => {
    const forged = new GoogleOauthStateService(
      'another-google-oauth-state-secret-long-enough'
    ).issue(claims);

    expect(() => new GoogleOauthStateService(secret).verify(forged)).toThrow();
  });

  it('refuses a tampered payload', () => {
    const service = new GoogleOauthStateService(secret);
    const signature = service.issue(claims).split('~')[1] ?? '';

    expect(() => service.verify(`tampered~${signature}`)).toThrow();
  });

  it('refuses a secret too short to sign with', () => {
    expect(() => new GoogleOauthStateService('too-short')).toThrow();
  });

  it('refuses a state older than five minutes', () => {
    const service = new GoogleOauthStateService(secret, () => new Date('2026-08-19T10:06:00Z'));
    const issuedAt = new Date('2026-08-19T10:00:00Z');
    const issuer = new GoogleOauthStateService(secret, () => issuedAt);

    expect(() => service.verify(issuer.issue(claims))).toThrow();
  });

  it('refuses a state that was already verified once', () => {
    const service = new GoogleOauthStateService(secret);
    const state = service.issue(claims);

    expect(service.verify(state)).toEqual(claims);
    expect(() => service.verify(state)).toThrow();
  });
});
