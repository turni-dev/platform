import { describe, expect, it } from 'vitest';
import {
  OwnerAccessTokenService,
  ownerAccessTokenLifetimeMs
} from '../owner-access-token.js';

const secret = 'owner-access-secret-with-at-least-thirty-two-characters';
const now = new Date('2026-08-14T10:00:00.000Z');
const claims = {
  userId: '01900000-0000-7000-8000-000000000001',
  tenantId: '01900000-0000-7000-8000-000000000002',
  sessionId: '01900000-0000-7000-8000-000000000003'
};

describe('OwnerAccessTokenService', () => {
  it('issues a short-lived token carrying only routing claims', () => {
    const service = new OwnerAccessTokenService(secret);

    const token = service.issue(claims, now);

    expect(service.verify(token, now)).toEqual({ ...claims, role: 'owner' });
    expect(
      service.verify(token, new Date(now.getTime() + ownerAccessTokenLifetimeMs - 1))
    ).toEqual({ ...claims, role: 'owner' });
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    expect(payload).toEqual({
      sub: claims.userId,
      tenantId: claims.tenantId,
      role: 'owner',
      sid: claims.sessionId,
      iat: Math.floor(now.getTime() / 1_000),
      exp: Math.floor((now.getTime() + ownerAccessTokenLifetimeMs) / 1_000)
    });
  });

  it('rejects an expired token', () => {
    const service = new OwnerAccessTokenService(secret);
    const token = service.issue(claims, now);

    expect(() =>
      service.verify(token, new Date(now.getTime() + ownerAccessTokenLifetimeMs))
    ).toThrow('Expired owner access token');
  });

  it('rejects a tampered payload, a foreign key and an unsigned algorithm', () => {
    const service = new OwnerAccessTokenService(secret);
    const token = service.issue(claims, now);
    const [header, payload, signature] = token.split('.');
    const elevated = Buffer.from(
      JSON.stringify({
        sub: claims.userId,
        tenantId: '01900000-0000-7000-8000-000000000009',
        role: 'owner',
        sid: claims.sessionId,
        iat: Math.floor(now.getTime() / 1_000),
        exp: Math.floor((now.getTime() + ownerAccessTokenLifetimeMs) / 1_000)
      })
    ).toString('base64url');
    const noneHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');

    expect(() => service.verify(`${header}.${elevated}.${signature}`, now)).toThrow(
      'Invalid owner access token'
    );
    expect(() =>
      new OwnerAccessTokenService(`${secret}-rotated`).verify(token, now)
    ).toThrow('Invalid owner access token');
    expect(() => service.verify(`${noneHeader}.${payload}.`, now)).toThrow(
      'Invalid owner access token'
    );
  });

  it('refuses a short signing secret', () => {
    expect(() => new OwnerAccessTokenService('too-short')).toThrow(
      'Owner access token secret must be at least 32 characters'
    );
  });
});
